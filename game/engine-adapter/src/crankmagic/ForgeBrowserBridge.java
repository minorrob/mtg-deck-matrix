/* SPDX-License-Identifier: GPL-3.0-or-later */
package crankmagic;

import com.google.gson.*;
import com.google.common.eventbus.Subscribe;
import com.sun.net.httpserver.HttpServer;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.event.GameEvent;
import forge.interfaces.IGameController;
import forge.game.zone.ZoneType;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import javax.swing.SwingUtilities;

/** A private loopback controller for one registered seat. Never expose its token to guests. */
public final class ForgeBrowserBridge {
    final String token=UUID.randomUUID().toString();
    final HttpServer server;
    final ForgeProbe.Journal journal;
    final int seatId;
    volatile Game game;
    volatile IGameController controller;
    Map<String,Object> projection=Map.of();
    long revision=0;
    String prompt="Opening CrankMagic Online…",ok="OK",cancel="Cancel",fallback="";
    boolean okEnabled=false,cancelEnabled=false,actionInFlight=false;
    List<Integer> selectables=List.of();
    List<Map<String,Object>> selectableCards=List.of();
    final Set<Integer> highlightedPlayers=new HashSet<>(),highlightedCards=new HashSet<>();
    Map<String,Object> pending;
    Map<String,Object> lastAction;
    JsonObject answer;
    final Map<String,Map<String,Object>> receipts=new LinkedHashMap<>();
    final Map<String,String> receiptPayloads=new HashMap<>();

    ForgeBrowserBridge(Path out,ForgeProbe.Journal journal)throws Exception{
        this(out,journal,0);
    }
    ForgeBrowserBridge(Path out,ForgeProbe.Journal journal,int seatId)throws Exception{
        this.journal=journal;
        this.seatId=seatId;
        Files.createDirectories(out);
        server=HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(),0),0);
        server.setExecutor(Executors.newCachedThreadPool(r->{Thread t=new Thread(r,"crankmagic-browser");t.setDaemon(true);return t;}));
        server.createContext("/",exchange->{
            int status=200;Map<String,Object> result;
            try{
                if(!token.equals(exchange.getRequestHeaders().getFirst("X-CrankMagic-Bridge")))throw new IllegalArgumentException("Invalid bridge session");
                if(exchange.getRequestMethod().equals("GET")&&exchange.getRequestURI().getPath().equals("/view"))result=view();
                else if(exchange.getRequestMethod().equals("POST")&&exchange.getRequestURI().getPath().equals("/concede"))result=concede();
                else if(exchange.getRequestMethod().equals("POST")&&exchange.getRequestURI().getPath().equals("/action")){
                    byte[] bytes=exchange.getRequestBody().readNBytes(65537);if(bytes.length>65536)throw new IllegalArgumentException("Action too large");
                    result=action(JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8)).getAsJsonObject());
                }else throw new IllegalArgumentException("Unknown bridge operation");
            }catch(Exception e){status=400;result=ForgeProbe.obj("error",e.getMessage()==null?"Action failed":e.getMessage());}
            byte[] bytes=ForgeProbe.JSON.toJson(result).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");exchange.getResponseHeaders().set("Cache-Control","no-store");
            exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });
        server.start();ForgeProbe.save(out.resolve("browser-bridge.json"),ForgeProbe.obj("port",server.getAddress().getPort(),"token",token));
    }
    synchronized Map<String,Object> view(){
        String inputType="";Map<Integer,String> actions=new TreeMap<>();Map<String,Object> payment=null;
        boolean activeInput=true;
        if(controller instanceof forge.player.PlayerControllerHuman human){
            var input=human.getInputQueue().getInput();if(input!=null)inputType=input.getClass().getSimpleName();
            activeInput=input!=null;
            if(input instanceof forge.gamemodes.match.input.InputPayMana){var paid=human.getPlayer().getPaidForSA();if(paid!=null){var root=paid.getRootAbility();payment=ForgeProbe.obj("abilityId",paid.getId(),"sourceId",paid.getHostCard().getId(),"triggered",root.isTrigger(),"automaticEligible",root.getActivatingPlayer()==human.getPlayer()&&!root.isTrigger()&&(root.isSpell()||root.isActivatedAbility()));}}
            if(pending==null&&!actionInFlight&&game!=null)for(var p:game.getRegisteredPlayers())for(ZoneType zone:List.of(ZoneType.Hand,ZoneType.Battlefield,ZoneType.Command))for(Card card:p.getCardsIn(zone)){
                if(!card.getView().canBeShownTo(human.getPlayer().getView()))continue;
                try{String action=human.getActivateDescription(card.getView());if(action!=null&&!action.isBlank())actions.put(card.getId(),action);}catch(RuntimeException ignored){}
            }
        }
        return ForgeProbe.obj("viewerSeatId",seatId,"viewerPlayerId",viewer()==null?null:viewer().getId(),"revision",revision,"state",projection,"ui",ForgeProbe.obj("prompt",prompt,"ok",ok,"cancel",cancel,"okEnabled",okEnabled&&activeInput,"cancelEnabled",cancelEnabled&&activeInput,"selectables",selectables,"selectableCards",selectableCards,"choice",pending,"nativeFallback",fallback,"inputType",inputType,"payment",payment,"cardActions",actions,"highlightedPlayers",new ArrayList<>(highlightedPlayers),"highlightedCards",new ArrayList<>(highlightedCards),"actionInFlight",actionInFlight,"lastAction",lastAction));
    }
    forge.game.player.Player viewer(){return controller instanceof forge.player.PlayerControllerHuman h?h.getPlayer():null;}
    synchronized Map<String,Object> concede(){
        if(controller==null||viewer()==null)throw new IllegalArgumentException("This seat is not ready to concede");
        if(viewer().conceded())return ForgeProbe.obj("accepted",true,"conceded",true);
        SwingUtilities.invokeLater(()->{controller.concede();record("browser-seat-conceded",ForgeProbe.obj("playerId",viewer()==null?seatId:viewer().getId()));snapshot();});
        return ForgeProbe.obj("accepted",true,"conceded",true);
    }
    void record(String kind,Object value){
        JsonObject payload=ForgeProbe.JSON.toJsonTree(value).getAsJsonObject();
        payload.addProperty("seatId",seatId);if(viewer()!=null)payload.addProperty("viewerPlayerId",viewer().getId());
        journal.append(kind,payload);
    }
    void attach(Game value){game=value;game.subscribeToEvents(this);snapshot();}
    @Subscribe public void event(GameEvent event){
        snapshot();
        // This synchronous event is emitted after phase replacement checks and before
        // PhaseHandler.onPhaseBegin performs the normal draw. Never draw a card here.
        if(event instanceof forge.game.event.GameEventTurnPhase phase
                && phase.phase()==forge.game.phase.PhaseType.DRAW && viewer()!=null && phase.playerTurn().getId()==viewer().getId()
                && !phase.phaseDesc().equals("dev")
                && !(game.getPhaseHandler().getTurn()==1&&game.getPlayers().size()==2)){
            synchronized(this){
                if(pending!=null)throw new IllegalStateException("A choice is already pending before the draw step");
                pending=ForgeProbe.obj("id",UUID.randomUUID().toString(),"title","Double-click your library to draw","mode","draw","min",0,"max",0,"options",List.of());
                answer=null;revision++;record("browser-choice-offered",pending);
                try{while(answer==null)wait();}
                catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("Draw confirmation interrupted",interrupted);}
                finally{answer=null;pending=null;revision++;}
            }
        }
    }
    void snapshot(){
        if(game==null||viewer()==null)return;
        try{
            Map<String,Object> next=ForgeProbe.projection(game,viewer());
            synchronized(this){projection=next;revision++;}
        }catch(RuntimeException e){/* An event can precede complete initialization. Next event retries. */}
    }
    synchronized void observe(String method,Object[] args){
        switch(method){
            case "setOriginalGameController":
                if(controller!=null&&controller!=args[1])throw new IllegalStateException("A seat bridge cannot be rebound");
                controller=(IGameController)args[1];break;
            // Control-changing effects use the original controller's InputProxy. The native
            // GUI tracks those effects separately; they must not change this seat's identity.
            case "setGameController":break;
            case "showPromptMessage": prompt=String.valueOf(args[1]);fallback="";revision++;break;
            case "updateButtons":
                if(args.length==6){ok=String.valueOf(args[1]);cancel=String.valueOf(args[2]);okEnabled=(boolean)args[3];cancelEnabled=(boolean)args[4];}
                else {okEnabled=(boolean)args[1];cancelEnabled=(boolean)args[2];}
                revision++;break;
            case "setSelectables":
                List<Integer> ids=new ArrayList<>();List<Map<String,Object>> cards=new ArrayList<>();
                for(Object value:(Iterable<?>)args[0]){
                    CardView card=(CardView)value;ids.add(card.getId());
                    // Forge deliberately supplied these private candidates to this seat. Publish
                    // only the minimum face identity needed to make hidden-zone choices usable.
                    cards.add(ForgeProbe.obj("cardId",card.getId(),"name",card.getCurrentState().getName(),"faceDown",card.isFaceDown()));
                }
                selectables=ids;selectableCards=cards;revision++;break;
            case "clearSelectables":selectables=List.of();selectableCards=List.of();revision++;break;
            case "setHighlighted":
                for(Object entity:(Iterable<?>)args[0]){Set<Integer> set=null;int id=-1;if(entity instanceof PlayerView p){set=highlightedPlayers;id=p.getId();}else if(entity instanceof CardView c){set=highlightedCards;id=c.getId();}if(set!=null){if((boolean)args[1])set.add(id);else set.remove(id);}}revision++;break;
            case "flashIncorrectAction":prompt="That action is unavailable. Check the current prompt, targets and available mana.";revision++;break;
        }
    }
    static final Object DELEGATE=new Object();
    Object choice(String method,Object[] a)throws Exception{
        if(method.equals("assignCombatDamage"))return assignCombatDamage(a);
        if(method.equals("assignGenericAmount"))return assignGenericAmount(a);
        // Only intercept decision methods whose full return contract is represented here.
        List<?> options=null;int min=1,max=1;String title="Choose";String mode="one";List<Integer> selectedIndices=List.of();
        switch(method){
            case "reveal":title=String.valueOf(a[0]);options=(List<?>)a[1];min=0;max=0;mode="ack";break;
            case "message":case "showErrorDialog":title=String.valueOf(a[0]);options=List.of();min=0;max=0;mode="ack";break;
            case "one":case "oneOrNone":title=String.valueOf(a[0]);options=(List<?>)a[1];min=method.equals("oneOrNone")?0:1;break;
            case "getChoices":title=String.valueOf(a[0]);min=(int)a[1];max=(int)a[2];options=(List<?>)a[3];mode="many";break;
            case "order":
                title=String.valueOf(a[0])+" · "+String.valueOf(a[1]);mode="order";
                if(a.length==4){options=(List<?>)a[2];min=options.size();max=options.size();}
                else {
                    if((boolean)a[7])return DELEGATE; // Sideboarding is not an in-game decision.
                    List<Object> all=new ArrayList<>();if(a[5]!=null)all.addAll((List<?>)a[5]);all.addAll((List<?>)a[4]);options=all;
                    int remainingMin=(int)a[2],remainingMax=(int)a[3];
                    min=remainingMax<0?0:Math.max(0,all.size()-remainingMax);max=remainingMin<0?all.size():all.size()-remainingMin;
                }
                if(options.isEmpty())return a.length==9?new forge.gui.interfaces.IGuiGame.OrderResult<>(List.of(),false):List.of();
                break;
            case "many":
                title=String.valueOf(a[0])+" · "+String.valueOf(a[1]);
                List<Object> manyItems=new ArrayList<>();List<?> prior=(List<?>)a[5];
                if(prior!=null)manyItems.addAll(prior);int priorCount=manyItems.size();manyItems.addAll((List<?>)a[4]);options=manyItems;
                min=priorCount+(int)a[2];max=(int)a[3]<0?manyItems.size():priorCount+(int)a[3];
                selectedIndices=new ArrayList<>();for(int i=0;i<priorCount;i++)selectedIndices.add(i);
                mode=max==1?"one":"order";break;
            case "insertInList":title=String.valueOf(a[0]);options=(List<?>)a[2];min=0;max=1;mode="one";break;
            case "chooseSingleEntityForEffect":
                title=String.valueOf(a[0]);options=(List<?>)a[1];min=(boolean)a[3]?0:1;max=1;mode="one";break;
            case "chooseEntitiesForEffect":
                title=String.valueOf(a[0]);options=(List<?>)a[1];min=(int)a[2];max=(int)a[3];mode="order";break;
            case "showInputDialog":
                title=String.valueOf(a[1])+" · "+String.valueOf(a[0]);options=a[4]==null?List.of():(List<?>)a[4];min=0;max=0;mode="text";break;
            case "manipulateCardList":
                title=String.valueOf(a[0]);options=new ArrayList<>();for(Object card:(Iterable<?>)a[1])((List<Object>)options).add(card);
                min=options.size();max=options.size();mode="order";break;
            case "getAbilityToPlay":
                title="Choose an ability";options=(List<?>)a[1];min=0;
                // Match CMatchUI: a non-mouse selection with one offered ability needs no menu.
                if(options.size()==1&&a[2]==null)return options.get(0);
                break;
            case "confirm":title=String.valueOf(a[1]);options=(List<?>)a[a.length-1];mode="boolean";break;
            case "showConfirmDialog":title=String.valueOf(a[0]);options=List.of(a[2],a[3]);mode="boolean";break;
            case "showOptionDialog":title=String.valueOf(a[0]);options=(List<?>)a[3];mode="index";break;
            case "getInteger":title=String.valueOf(a[0]);min=(int)a[1];max=(int)a[2];mode="integer";options=List.of();break;
            default:
                if(Set.of("assignCombatDamage","assignGenericAmount","order","manipulateCardList","chooseSingleEntityForEffect","chooseEntitiesForEffect","showInputDialog","many","insertInList").contains(method)){
                    synchronized(this){fallback="Finish this "+method+" choice in the engine window. Browser support for this prompt is still being built.";revision++;}
                }
                return DELEGATE;
        }
        if(mode.equals("many")&&max<0)max=options.size();
        if(options.isEmpty()&&!mode.equals("integer")&&!mode.equals("ack")&&!mode.equals("text")&&!method.equals("chooseEntitiesForEffect"))return mode.equals("many")?List.of():method.equals("insertInList")?List.of(a[1]):null;
        String id=UUID.randomUUID().toString();List<Map<String,Object>> labels=new ArrayList<>();
        Set<Object> movable=new HashSet<>();if(method.equals("manipulateCardList"))for(Object item:(Iterable<?>)a[2])movable.add(item);
        for(int i=0;i<options.size();i++){Object item=options.get(i);String label=String.valueOf(item);if(item instanceof CardView c)label=c.getCurrentState().getName();else if(item instanceof PlayerView p)label=p.getName();Map<String,Object> shown=ForgeProbe.obj("index",i,"label",label);if(method.equals("manipulateCardList"))shown.put("movable",movable.contains(item));labels.add(shown);}
        JsonObject submitted;
        synchronized(this){
            if(pending!=null)throw new IllegalStateException("Overlapping browser choice");
            pending=ForgeProbe.obj("id",id,"title",title,"mode",mode,"min",min,"max",max,"options",labels);answer=null;revision++;
            if(!selectedIndices.isEmpty())pending.put("selectedIndices",selectedIndices);
            if(method.equals("showInputDialog")){pending.put("initial",a[3]==null?"":String.valueOf(a[3]));pending.put("numeric",(boolean)a[5]);}
            if(method.equals("manipulateCardList")){pending.put("choiceKind","manipulate");pending.put("toTop",(boolean)a[3]);pending.put("toBottom",(boolean)a[4]);pending.put("toAnywhere",(boolean)a[5]);}
            if(method.equals("getAbilityToPlay")&&a[0] instanceof CardView card){pending.put("cardId",card.getId());pending.put("autoSelect",a[2]==null);}
            record("browser-choice-offered",pending);
            while(answer==null)wait();submitted=answer;answer=null;pending=null;revision++;
        }
        if(mode.equals("integer"))return submitted.get("value").getAsInt();
        if(mode.equals("ack"))return null;
        if(mode.equals("text"))return submitted.has("cancel")&&submitted.get("cancel").getAsBoolean()?null:submitted.get("text").getAsString();
        List<Object> selected=new ArrayList<>();for(JsonElement index:submitted.getAsJsonArray("indices"))selected.add(options.get(index.getAsInt()));
        if(method.equals("chooseEntitiesForEffect")){
            journal.append("effect-choice-completed",ForgeProbe.obj("prompt",title,"playerId",viewer().getId(),"selectedCount",selected.size(),"turn",game.getPhaseHandler().getTurn()));
            if(title.equals(forge.util.Localizer.getInstance().getMessage("lblChooseProliferateTarget")))journal.append("mechanic-choice-completed",ForgeProbe.obj("mechanic","Proliferate","playerId",viewer().getId(),"selectedCount",selected.size(),"turn",game.getPhaseHandler().getTurn()));
        }
        if(mode.equals("many"))return selected;
        if(mode.equals("order"))return a.length==9?new forge.gui.interfaces.IGuiGame.OrderResult<>(selected,false):selected;
        if(mode.equals("boolean"))return submitted.getAsJsonArray("indices").get(0).getAsInt()==0;
        if(mode.equals("index"))return submitted.getAsJsonArray("indices").get(0).getAsInt();
        if(method.equals("insertInList")){List<Object> result=new ArrayList<>((List<?>)a[2]);int at=selected.isEmpty()?0:result.indexOf(selected.get(0))+1;result.add(at,a[1]);return result;}
        return selected.isEmpty()?null:selected.get(0);
    }
    Object assignGenericAmount(Object[] a)throws Exception{
        Map<Object,Integer> targets=(Map<Object,Integer>)a[1];int total=(int)a[2];boolean atLeastOne=(boolean)a[3];
        if(total<=0)return Collections.emptyMap();
        List<Object> keys=new ArrayList<>(targets.keySet());List<Map<String,Object>> options=new ArrayList<>();
        for(int i=0;i<keys.size();i++){Object item=keys.get(i);String label=String.valueOf(item);if(item instanceof CardView c)label=c.getCurrentState().getName();else if(item instanceof PlayerView p)label=p.getName();Integer cap=targets.get(item);options.add(ForgeProbe.obj("index",i,"label",label,"max",cap==null?total:cap));}
        JsonObject submitted;
        synchronized(this){
            if(pending!=null)throw new IllegalStateException("Overlapping browser choice");
            pending=ForgeProbe.obj("id",UUID.randomUUID().toString(),"title","Assign "+total+" "+String.valueOf(a[4]),"mode","amount","min",0,"max",total,"total",total,"minEach",atLeastOne?1:0,"options",options);
            answer=null;revision++;record("browser-choice-offered",pending);while(answer==null)wait();submitted=answer;answer=null;pending=null;revision++;
        }
        Map<Object,Integer> result=new LinkedHashMap<>();JsonArray amounts=submitted.getAsJsonArray("amounts");for(int i=0;i<keys.size();i++)result.put(keys.get(i),amounts.get(i).getAsInt());return result;
    }
    static void validateGenericAmount(Map<String,Object> decision,JsonObject request){
        List<Map<String,Object>> targets=(List<Map<String,Object>>)decision.get("options");JsonArray amounts=request.getAsJsonArray("amounts");
        if(amounts==null||amounts.size()!=targets.size())throw new IllegalArgumentException("Assign an amount to each listed recipient");
        long sum=0;int minimum=(int)decision.get("minEach");for(int i=0;i<targets.size();i++){double amount=amounts.get(i).getAsDouble();int cap=(int)targets.get(i).get("max");if(!Double.isFinite(amount)||amount!=Math.rint(amount)||amount<minimum||amount>cap)throw new IllegalArgumentException("Use whole amounts within each recipient's allowed range");sum+=(long)amount;}
        if(sum!=(int)decision.get("total"))throw new IllegalArgumentException("Assign the complete amount before confirming");
    }
    static void validateManipulateOrder(Map<String,Object> decision,JsonObject request){
        List<Map<String,Object>> options=(List<Map<String,Object>>)decision.get("options");JsonArray submitted=request.getAsJsonArray("indices");
        List<Integer> originalFixed=new ArrayList<>(),submittedFixed=new ArrayList<>();int firstFixed=options.size(),lastFixed=-1;
        for(int i=0;i<options.size();i++)if(!Boolean.TRUE.equals(options.get(i).get("movable")))originalFixed.add(i);
        for(int position=0;position<submitted.size();position++){
            int index=submitted.get(position).getAsInt();if(!Boolean.TRUE.equals(options.get(index).get("movable"))){submittedFixed.add(index);firstFixed=Math.min(firstFixed,position);lastFixed=Math.max(lastFixed,position);}
        }
        if(!submittedFixed.equals(originalFixed))throw new IllegalArgumentException("Cards that cannot move must remain in their original order");
        if(Boolean.TRUE.equals(decision.get("toAnywhere")))return;
        boolean toTop=Boolean.TRUE.equals(decision.get("toTop")),toBottom=Boolean.TRUE.equals(decision.get("toBottom"));
        for(int position=0;position<submitted.size();position++){
            int index=submitted.get(position).getAsInt();if(!Boolean.TRUE.equals(options.get(index).get("movable")))continue;
            boolean legal=toTop&&position<firstFixed||toBottom&&position>lastFixed||!toTop&&!toBottom&&position==index;
            if(!legal)throw new IllegalArgumentException("Move selectable cards only to the allowed top or bottom area");
        }
    }
    synchronized boolean isSelecting(){return !selectables.isEmpty();}
    /** Mirrors the pinned Forge damage dialog contract, including its null defender key. */
    Object assignCombatDamage(Object[] a)throws Exception{
        CardView source=(CardView)a[0];List<CardView> targets=new ArrayList<>((List<CardView>)a[1]);
        int total=(int)a[2];boolean override=(boolean)a[4],maySkip=(boolean)a[5];
        if(total<=0)return Collections.emptyMap();
        boolean divide=source.getCurrentState().hasDivideDamage()&&override;
        if(a[3]!=null&&(source.getCurrentState().hasTrample()||divide))targets.add(null);
        List<Map<String,Object>> options=new ArrayList<>();
        for(int i=0;i<targets.size();i++){
            CardView target=targets.get(i);int lethal=0;
            if(target!=null){lethal=Math.max(0,target.getLethalDamage());if(target.getCurrentState().isPlaneswalker())lethal=Integer.parseInt(target.getCurrentState().getLoyalty());else if(source.getCurrentState().hasDeathtouch())lethal=Math.min(lethal,1);}
            String label=target==null?String.valueOf(a[3]):target.getCurrentState().getName();
            options.add(ForgeProbe.obj("index",i,"label",label,"cardId",target==null?null:target.getId(),"lethal",lethal,"defender",target==null));
        }
        JsonObject submitted;
        synchronized(this){
            if(pending!=null)throw new IllegalStateException("Overlapping browser choice");
            pending=ForgeProbe.obj("id",UUID.randomUUID().toString(),"title","Assign "+total+" combat damage from "+source.getCurrentState().getName(),"mode","damage","min",0,"max",total,"total",total,"cardId",source.getId(),"options",options,"overrideOrder",override,"divide",divide,"maySkip",maySkip);
            answer=null;revision++;record("browser-choice-offered",pending);
            while(answer==null)wait();submitted=answer;answer=null;pending=null;revision++;
        }
        if(submitted.has("skip")&&submitted.get("skip").getAsBoolean())return null;
        Map<CardView,Integer> result=new LinkedHashMap<>();JsonArray amounts=submitted.getAsJsonArray("amounts");
        for(int i=0;i<targets.size();i++)result.put(targets.get(i),amounts.get(i).getAsInt());
        record("combat-damage-assigned",ForgeProbe.obj("sourceCardId",source.getId(),"total",total,"amounts",amounts));
        return result;
    }
    static void validateCombatDamage(Map<String,Object> decision,JsonObject request){
        if(request.has("skip")&&request.get("skip").getAsBoolean()){
            if(!Boolean.TRUE.equals(decision.get("maySkip")))throw new IllegalArgumentException("This damage assignment cannot be skipped");return;
        }
        List<Map<String,Object>> targets=(List<Map<String,Object>>)decision.get("options");
        JsonArray amounts=request.getAsJsonArray("amounts");
        if(amounts==null||amounts.size()!=targets.size())throw new IllegalArgumentException("Assign damage to each listed recipient");
        long sum=0;boolean priorNeedsLethal=false;
        for(int i=0;i<targets.size();i++){
            double amount=amounts.get(i).getAsDouble();
            if(!Double.isFinite(amount)||amount!=Math.rint(amount)||amount<0||amount>(int)decision.get("total"))throw new IllegalArgumentException("Use whole, nonnegative damage amounts");
            Map<String,Object> target=targets.get(i);
            if(amount>0&&priorNeedsLethal&&!Boolean.TRUE.equals(decision.get("divide"))&&(!Boolean.TRUE.equals(decision.get("overrideOrder"))||Boolean.TRUE.equals(target.get("defender"))))throw new IllegalArgumentException("Assign lethal damage to the required blockers before assigning damage onward");
            priorNeedsLethal|=amount<(int)target.get("lethal");sum+=(long)amount;
        }
        if(sum!=(int)decision.get("total"))throw new IllegalArgumentException("Assign exactly "+decision.get("total")+" damage before confirming");
    }
    Map<String,Object> action(JsonObject request)throws Exception{
        final String id=request.get("actionId").getAsString(),kind=request.get("kind").getAsString();
        final long queuedRevision;
        synchronized(this){
            if(!id.matches("[a-fA-F0-9-]{36}"))throw new IllegalArgumentException("Invalid action id");
            if(receipts.containsKey(id)){
                if(!Objects.equals(receiptPayloads.get(id),request.toString()))throw new IllegalArgumentException("Action id was reused with different content");
                return receipts.get(id);
            }
            if(request.get("revision").getAsLong()!=revision)throw new IllegalArgumentException("The board changed. Review the refreshed choice and try again.");
            if(kind.equals("answer")){
                if(pending==null||answer!=null||!Objects.equals(pending.get("id"),request.get("choiceId").getAsString()))throw new IllegalArgumentException("This choice has expired");
                int min=(int)pending.get("min"),max=(int)pending.get("max");
                if(pending.get("mode").equals("damage"))validateCombatDamage(pending,request);
                else if(pending.get("mode").equals("amount"))validateGenericAmount(pending,request);
                else if(pending.get("mode").equals("integer")){
                    double value=request.get("value").getAsDouble();if(!Double.isFinite(value)||value!=Math.rint(value)||value<min||value>max)throw new IllegalArgumentException("Number outside allowed range");
                }else if(pending.get("mode").equals("text")){
                    boolean cancel=request.has("cancel")&&request.get("cancel").getAsBoolean();if(!cancel){if(!request.has("text")||!request.get("text").isJsonPrimitive()||!request.get("text").getAsJsonPrimitive().isString()||request.get("text").getAsString().length()>1000)throw new IllegalArgumentException("Enter a response of at most 1000 characters");if(Boolean.TRUE.equals(pending.get("numeric"))&&!request.get("text").getAsString().matches("[0-9]+"))throw new IllegalArgumentException("Enter a whole number");}
                }else{
                    JsonArray indices=request.getAsJsonArray("indices");int size=((List<?>)pending.get("options")).size();Set<Integer> seen=new HashSet<>();
                    if(indices.size()<min||indices.size()>max)throw new IllegalArgumentException("Select the required number of options");
                    for(JsonElement n:indices){double value=n.getAsDouble();if(value!=Math.rint(value)||value<0||value>=size||!seen.add((int)value))throw new IllegalArgumentException("Invalid selection");}
                    if(Objects.equals(pending.get("choiceKind"),"manipulate"))validateManipulateOrder(pending,request);
                }
                record("browser-choice-answered",request);answer=request.deepCopy();revision++;notifyAll();receiptPayloads.put(id,request.toString());return receipt(id);
            }
            if(actionInFlight||pending!=null||controller==null||!fallback.isEmpty())throw new IllegalArgumentException("Complete the current decision first");
            if(controller instanceof forge.player.PlayerControllerHuman h&&h.getInputQueue().getInput()==null)throw new IllegalArgumentException("This seat has no active decision");
            if(kind.equals("ok")&&!okEnabled||kind.equals("cancel")&&!cancelEnabled)throw new IllegalArgumentException("Button is unavailable");
            if(!Set.of("ok","cancel","card","player").contains(kind))throw new IllegalArgumentException("Unsupported action");
            // Reserve before scheduling: retries cannot apply a second payment or selection.
            receiptPayloads.put(id,request.toString());receipt(id);queuedRevision=++revision;actionInFlight=true;lastAction=ForgeProbe.obj("id",id,"status","pending");
        }
        SwingUtilities.invokeLater(()->{
            try{
                synchronized(this){if(revision!=queuedRevision||pending!=null||!fallback.isEmpty())throw new IllegalArgumentException("The decision changed before this action could be applied");}
                switch(kind){
                    case "ok":controller.selectButtonOk();break;
                    case "cancel":{
                        Map<String,Object> cancelled=null;
                        if(controller instanceof forge.player.PlayerControllerHuman human){
                            var paid=human.getPlayer().getPaidForSA();
                            if(paid!=null&&paid.getRootAbility().isSpell()){
                                Card card=paid.getHostCard();String cost=prompt.replaceFirst("(?s)^.*Pay Mana Cost:\\s*","").trim();
                                cancelled=ForgeProbe.obj("playerId",human.getPlayer().getId(),"turn",game.getPhaseHandler().getTurn(),"phase",String.valueOf(game.getPhaseHandler().getPhase()),"card",ForgeProbe.obj("cardId",card.getId(),"name",card.getName(),"faceDown",card.getView().isFaceDown()),"cost",cost);
                            }
                        }
                        controller.selectButtonCancel();if(cancelled!=null)record("browser-cast-cancelled",cancelled);break;
                    }
                    case "player":
                        int playerId=request.get("targetId").getAsInt();var target=game.getRegisteredPlayers().stream().filter(p->p.getId()==playerId).findFirst().orElseThrow(()->new IllegalArgumentException("Player is not in this match"));controller.selectPlayer(target.getView(),null);break;
                    case "card":
                        int cardId=request.get("targetId").getAsInt();Card found=null;
                        for(var p:game.getRegisteredPlayers())for(ZoneType zone:List.of(ZoneType.Hand,ZoneType.Battlefield,ZoneType.Command,ZoneType.Exile,ZoneType.Graveyard))for(Card card:p.getCardsIn(zone))if(card.getId()==cardId&&viewer()!=null&&card.getView().canBeShownTo(viewer().getView()))found=card;
                        if(found==null)throw new IllegalArgumentException("Card is not visible");
                        if(!controller.selectCard(found.getView(),List.of(),null))throw new IllegalArgumentException("This card has no available action now. Check timing, costs, targets and land plays remaining.");break;
                }
                record("browser-action-submitted",request);
                synchronized(this){lastAction=ForgeProbe.obj("id",id,"status","completed");revision++;}
            }catch(Exception e){synchronized(this){lastAction=ForgeProbe.obj("id",id,"status","error","message",e.getMessage());revision++;}}
            finally{snapshot();synchronized(this){actionInFlight=false;}}
        });
        synchronized(this){return receipts.get(id);}
    }
    private Map<String,Object> receipt(String id){Map<String,Object> value=ForgeProbe.obj("accepted",true,"actionId",id);receipts.put(id,value);if(receipts.size()>1024){String oldest=receipts.keySet().iterator().next();receipts.remove(oldest);receiptPayloads.remove(oldest);}return value;}
}
