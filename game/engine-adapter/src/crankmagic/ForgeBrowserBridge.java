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

/** Solo loopback browser controls. Native GUI remains a fallback for unsupported complex dialogs. */
public final class ForgeBrowserBridge {
    final String token=UUID.randomUUID().toString();
    final HttpServer server;
    final ForgeProbe.Journal journal;
    volatile Game game;
    volatile IGameController controller;
    Map<String,Object> projection=Map.of();
    long revision=0;
    String prompt="Opening CrankMagic Online…",ok="OK",cancel="Cancel",fallback="";
    boolean okEnabled=false,cancelEnabled=false,actionInFlight=false;
    List<Integer> selectables=List.of();
    final Set<Integer> highlightedPlayers=new HashSet<>(),highlightedCards=new HashSet<>();
    Map<String,Object> pending;
    Map<String,Object> lastAction;
    JsonObject answer;
    final Map<String,Map<String,Object>> receipts=new LinkedHashMap<>();

    ForgeBrowserBridge(Path out,ForgeProbe.Journal journal)throws Exception{
        this.journal=journal;
        server=HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(),0),0);
        server.setExecutor(Executors.newCachedThreadPool(r->{Thread t=new Thread(r,"crankmagic-browser");t.setDaemon(true);return t;}));
        server.createContext("/",exchange->{
            int status=200;Map<String,Object> result;
            try{
                if(!token.equals(exchange.getRequestHeaders().getFirst("X-CrankMagic-Bridge")))throw new IllegalArgumentException("Invalid bridge session");
                if(exchange.getRequestMethod().equals("GET")&&exchange.getRequestURI().getPath().equals("/view"))result=view();
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
        String inputType="";Map<Integer,String> actions=new TreeMap<>();
        if(controller instanceof forge.player.PlayerControllerHuman human){
            var input=human.getInputQueue().getInput();if(input!=null)inputType=input.getClass().getSimpleName();
            if(pending==null&&!actionInFlight&&game!=null)for(var p:game.getRegisteredPlayers())for(ZoneType zone:List.of(ZoneType.Hand,ZoneType.Battlefield,ZoneType.Command))for(Card card:p.getCardsIn(zone)){
                if(!card.getView().canBeShownTo(human.getPlayer().getView()))continue;
                try{String action=human.getActivateDescription(card.getView());if(action!=null&&!action.isBlank())actions.put(card.getId(),action);}catch(RuntimeException ignored){}
            }
        }
        return ForgeProbe.obj("revision",revision,"state",projection,"ui",ForgeProbe.obj("prompt",prompt,"ok",ok,"cancel",cancel,"okEnabled",okEnabled,"cancelEnabled",cancelEnabled,"selectables",selectables,"choice",pending,"nativeFallback",fallback,"inputType",inputType,"cardActions",actions,"highlightedPlayers",new ArrayList<>(highlightedPlayers),"highlightedCards",new ArrayList<>(highlightedCards),"actionInFlight",actionInFlight,"lastAction",lastAction));
    }
    void attach(Game value){game=value;game.subscribeToEvents(this);snapshot();}
    @Subscribe public void event(GameEvent event){
        snapshot();
        // This synchronous event is emitted after phase replacement checks and before
        // PhaseHandler.onPhaseBegin performs the normal draw. Never draw a card here.
        if(event instanceof forge.game.event.GameEventTurnPhase phase
                && phase.phase()==forge.game.phase.PhaseType.DRAW && phase.playerTurn().getId()==0
                && !phase.phaseDesc().equals("dev")
                && !(game.getPhaseHandler().getTurn()==1&&game.getPlayers().size()==2)){
            synchronized(this){
                if(pending!=null)throw new IllegalStateException("A choice is already pending before the draw step");
                pending=ForgeProbe.obj("id",UUID.randomUUID().toString(),"title","Double-click your library to draw","mode","draw","min",0,"max",0,"options",List.of());
                answer=null;revision++;journal.append("browser-choice-offered",pending);
                try{while(answer==null)wait();}
                catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("Draw confirmation interrupted",interrupted);}
                finally{answer=null;pending=null;revision++;}
            }
        }
    }
    void snapshot(){
        if(game==null)return;
        try{
            Map<String,Object> next=ForgeProbe.projection(game,game.getRegisteredPlayers().get(0));
            synchronized(this){projection=next;revision++;}
        }catch(RuntimeException e){/* An event can precede complete initialization. Next event retries. */}
    }
    synchronized void observe(String method,Object[] args){
        switch(method){
            case "setOriginalGameController":case "setGameController": if(((PlayerView)args[0]).getId()==0)controller=(IGameController)args[1];break;
            case "showPromptMessage": prompt=String.valueOf(args[1]);fallback="";revision++;break;
            case "updateButtons":
                if(args.length==6){ok=String.valueOf(args[1]);cancel=String.valueOf(args[2]);okEnabled=(boolean)args[3];cancelEnabled=(boolean)args[4];}
                else {okEnabled=(boolean)args[1];cancelEnabled=(boolean)args[2];}
                revision++;break;
            case "setSelectables": List<Integer> ids=new ArrayList<>();for(Object c:(Iterable<?>)args[0])ids.add(((CardView)c).getId());selectables=ids;revision++;break;
            case "clearSelectables":selectables=List.of();revision++;break;
            case "setHighlighted":
                for(Object entity:(Iterable<?>)args[0]){Set<Integer> set=null;int id=-1;if(entity instanceof PlayerView p){set=highlightedPlayers;id=p.getId();}else if(entity instanceof CardView c){set=highlightedCards;id=c.getId();}if(set!=null){if((boolean)args[1])set.add(id);else set.remove(id);}}revision++;break;
            case "flashIncorrectAction":prompt="That action is unavailable. Check the current prompt, targets and available mana.";revision++;break;
        }
    }
    static final Object DELEGATE=new Object();
    Object choice(String method,Object[] a)throws Exception{
        // Only intercept decision methods whose full return contract is represented here.
        List<?> options=null;int min=1,max=1;String title="Choose";String mode="one";
        switch(method){
            case "reveal":title=String.valueOf(a[0]);options=(List<?>)a[1];min=0;max=0;mode="ack";break;
            case "message":case "showErrorDialog":title=String.valueOf(a[0]);options=List.of();min=0;max=0;mode="ack";break;
            case "one":case "oneOrNone":title=String.valueOf(a[0]);options=(List<?>)a[1];min=method.equals("oneOrNone")?0:1;break;
            case "getChoices":title=String.valueOf(a[0]);min=(int)a[1];max=(int)a[2];options=(List<?>)a[3];mode="many";break;
            case "chooseEntitiesForEffect":
                // Only the public proliferate-target contract is supported here. Other effect choices retain native reveal handling.
                if(!String.valueOf(a[0]).equals(forge.util.Localizer.getInstance().getMessage("lblChooseProliferateTarget"))){synchronized(this){fallback="Finish this effect choice in the engine window.";revision++;}return DELEGATE;}
                title=String.valueOf(a[0]);options=(List<?>)a[1];min=(int)a[2];max=(int)a[3];mode="many";break;
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
        if(options.isEmpty()&&!mode.equals("integer")&&!mode.equals("ack")&&!method.equals("chooseEntitiesForEffect"))return mode.equals("many")?List.of():null;
        String id=UUID.randomUUID().toString();List<Map<String,Object>> labels=new ArrayList<>();
        for(int i=0;i<options.size();i++){Object item=options.get(i);String label=String.valueOf(item);if(item instanceof CardView c)label=c.getCurrentState().getName();labels.add(ForgeProbe.obj("index",i,"label",label));}
        JsonObject submitted;
        synchronized(this){
            if(pending!=null)throw new IllegalStateException("Overlapping browser choice");
            pending=ForgeProbe.obj("id",id,"title",title,"mode",mode,"min",min,"max",max,"options",labels);answer=null;revision++;
            if(method.equals("getAbilityToPlay")&&a[0] instanceof CardView card){pending.put("cardId",card.getId());pending.put("autoSelect",a[2]==null);}
            journal.append("browser-choice-offered",pending);
            while(answer==null)wait();submitted=answer;answer=null;pending=null;revision++;
        }
        if(mode.equals("integer"))return submitted.get("value").getAsInt();
        if(mode.equals("ack"))return null;
        List<Object> selected=new ArrayList<>();for(JsonElement index:submitted.getAsJsonArray("indices"))selected.add(options.get(index.getAsInt()));
        if(mode.equals("many")){
            if(method.equals("chooseEntitiesForEffect"))journal.append("mechanic-choice-completed",ForgeProbe.obj("mechanic","Proliferate","playerId",0,"turn",game.getPhaseHandler().getTurn()));
            return selected;
        }
        if(mode.equals("boolean"))return submitted.getAsJsonArray("indices").get(0).getAsInt()==0;
        if(mode.equals("index"))return submitted.getAsJsonArray("indices").get(0).getAsInt();
        return selected.isEmpty()?null:selected.get(0);
    }
    Map<String,Object> action(JsonObject request)throws Exception{
        final String id=request.get("actionId").getAsString(),kind=request.get("kind").getAsString();
        final long queuedRevision;
        synchronized(this){
            if(!id.matches("[a-fA-F0-9-]{36}"))throw new IllegalArgumentException("Invalid action id");
            if(receipts.containsKey(id))return receipts.get(id);
            if(request.get("revision").getAsLong()!=revision)throw new IllegalArgumentException("The board changed. Review the refreshed choice and try again.");
            if(kind.equals("answer")){
                if(pending==null||answer!=null||!Objects.equals(pending.get("id"),request.get("choiceId").getAsString()))throw new IllegalArgumentException("This choice has expired");
                int min=(int)pending.get("min"),max=(int)pending.get("max");
                if(pending.get("mode").equals("integer")){
                    double value=request.get("value").getAsDouble();if(!Double.isFinite(value)||value!=Math.rint(value)||value<min||value>max)throw new IllegalArgumentException("Number outside allowed range");
                }else{
                    JsonArray indices=request.getAsJsonArray("indices");int size=((List<?>)pending.get("options")).size();Set<Integer> seen=new HashSet<>();
                    if(indices.size()<min||indices.size()>max)throw new IllegalArgumentException("Select the required number of options");
                    for(JsonElement n:indices){double value=n.getAsDouble();if(value!=Math.rint(value)||value<0||value>=size||!seen.add((int)value))throw new IllegalArgumentException("Invalid selection");}
                }
                journal.append("browser-choice-answered",request);answer=request.deepCopy();revision++;notifyAll();return receipt(id);
            }
            if(actionInFlight||pending!=null||controller==null||!fallback.isEmpty())throw new IllegalArgumentException("Complete the current decision first");
            if(kind.equals("ok")&&!okEnabled||kind.equals("cancel")&&!cancelEnabled)throw new IllegalArgumentException("Button is unavailable");
            if(!Set.of("ok","cancel","card","player").contains(kind))throw new IllegalArgumentException("Unsupported action");
            // Reserve before scheduling: retries cannot apply a second payment or selection.
            receipt(id);queuedRevision=++revision;actionInFlight=true;lastAction=ForgeProbe.obj("id",id,"status","pending");
        }
        SwingUtilities.invokeLater(()->{
            try{
                synchronized(this){if(revision!=queuedRevision||pending!=null||!fallback.isEmpty())throw new IllegalArgumentException("The decision changed before this action could be applied");}
                switch(kind){
                    case "ok":controller.selectButtonOk();break;
                    case "cancel":controller.selectButtonCancel();break;
                    case "player":
                        int playerId=request.get("targetId").getAsInt();game.getRegisteredPlayers().stream().filter(p->p.getId()==playerId).findFirst().ifPresent(p->controller.selectPlayer(p.getView(),null));break;
                    case "card":
                        int cardId=request.get("targetId").getAsInt();Card found=null;
                        for(var p:game.getRegisteredPlayers())for(ZoneType zone:List.of(ZoneType.Hand,ZoneType.Battlefield,ZoneType.Command,ZoneType.Exile,ZoneType.Graveyard))for(Card card:p.getCardsIn(zone))if(card.getId()==cardId&&card.getView().canBeShownTo(game.getRegisteredPlayers().get(0).getView()))found=card;
                        if(found==null)throw new IllegalArgumentException("Card is not visible");
                        if(!controller.selectCard(found.getView(),List.of(),null))throw new IllegalArgumentException("This card has no available action now. Check timing, costs, targets and land plays remaining.");break;
                }
                journal.append("browser-action-submitted",request);
                synchronized(this){lastAction=ForgeProbe.obj("id",id,"status","completed");revision++;}
            }catch(Exception e){synchronized(this){lastAction=ForgeProbe.obj("id",id,"status","error","message",e.getMessage());revision++;}}
            finally{snapshot();synchronized(this){actionInFlight=false;}}
        });
        synchronized(this){return receipts.get(id);}
    }
    private Map<String,Object> receipt(String id){Map<String,Object> value=ForgeProbe.obj("accepted",true,"actionId",id);receipts.put(id,value);if(receipts.size()>1024)receipts.remove(receipts.keySet().iterator().next());return value;}
}
