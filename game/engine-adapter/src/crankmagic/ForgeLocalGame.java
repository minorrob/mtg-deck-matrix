/* SPDX-License-Identifier: GPL-3.0-or-later */
package crankmagic;

import com.google.gson.*;
import forge.GuiDesktop;
import forge.Singletons;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.*;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.LobbyPlayerHuman;
import java.lang.reflect.Proxy;
import java.lang.reflect.InvocationTargetException;
import forge.util.MyRandom;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import javax.swing.SwingUtilities;

/** Human browser decisions backed by Forge, with native fallback for complex prompts. */
public final class ForgeLocalGame {
    public static void main(String[] args) throws Exception {
        if(args.length!=2)throw new IllegalArgumentException("pod.json output-directory");
        Path out=Path.of(args[1]);Files.createDirectories(out);
        JsonObject pod=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
        // Its static initializer installs a handler; install our local handler afterward.
        Class.forName("forge.error.ExceptionHandler");
        Thread.setDefaultUncaughtExceptionHandler((t,e)->{e.printStackTrace();try{ForgeProbe.save(out.resolve("error.json"),ForgeProbe.obj("thread",t.getName(),"error",e.toString()));}catch(Exception ignored){}});
        System.setProperty("sun.java2d.d3d","false");
        final String assets=System.getProperty("crankmagic.forgeAssets");
        GuiBase.setInterface(new GuiDesktop(){@Override public String getAssetsDir(){return assets;}});
        // Skip Forge Main's remote crash-report initialization. This profile belongs to this match.
        Singletons.initializeOnce(true);
        var prefs=FModel.getPreferences();
        String humanName=pod.getAsJsonArray("seats").get(0).getAsJsonObject().get("name").getAsString();
        prefs.setPref(FPref.CHECK_SNAPSHOT_AT_STARTUP,false);prefs.setPref(FPref.PLAYER_NAME,humanName);
        prefs.setPref(FPref.FILTERED_HANDS,false);prefs.setPref(FPref.UI_ENABLE_AI_CHEATS,false);
        prefs.setPref(FPref.MULLIGAN_RULE,"London");
        forge.gui.download.CdnUuidCache.markBulkSyncPromptAnswered();
        Singletons.getControl().initialize();
        SwingUtilities.invokeAndWait(()->{});
        ForgeProbe.TapeRandom rng=new ForgeProbe.TapeRandom(pod.get("seed").getAsLong(),null);
        ForgeProbe.activeRandom=rng;MyRandom.setRandom(rng);
        var journal=new ForgeProbe.Journal(out.resolve("events.ndjson"));
        List<ForgeBrowserBridge> bridges=new ArrayList<>();
        AtomicBoolean closed=new AtomicBoolean();
        Runtime.getRuntime().addShutdownHook(new Thread(()->{try{if(closed.compareAndSet(false,true))journal.close();}catch(Exception e){e.printStackTrace();}}));
        List<RegisteredPlayer> players=new ArrayList<>();List<Object> coverage=new ArrayList<>();
        Map<RegisteredPlayer,ForgeBrowserBridge> humanBridges=new LinkedHashMap<>();
        for(JsonElement entry:pod.getAsJsonArray("seats")){
            JsonObject seat=entry.getAsJsonObject();Deck deck=ForgeProbe.deck(seat.getAsJsonObject("deck"),coverage);
            String problem=GameType.Commander.getDeckFormat().getDeckConformanceProblem(deck);
            if(problem!=null)throw new IllegalArgumentException(deck.getName()+": "+problem);
            RegisteredPlayer rp=RegisteredPlayer.forCommander(deck);
            int seatId=seat.get("seatId").getAsInt();
            if(seatId!=players.size())throw new IllegalArgumentException("Seats must have contiguous ordered IDs");
            String control=seat.has("engineController")?seat.get("engineController").getAsString():(seatId==0?"browser":"native-ai");
            if(!Set.of("browser","native-ai").contains(control))throw new IllegalArgumentException("Unknown engine controller");
            if(control.equals("browser")){
                rp.setPlayer(new LobbyPlayerHuman(seat.get("name").getAsString()));
                var bridge=new ForgeBrowserBridge(seatId==0?out:out.resolve("seats/"+seatId),journal,seatId);
                humanBridges.put(rp,bridge);bridges.add(bridge);
            }
            else{LobbyPlayerAi ai=new LobbyPlayerAi(seat.get("name").getAsString(),Set.of());ai.setAiProfile(seat.get("nativeProfile").getAsString());rp.setPlayer(ai);}
            players.add(rp);
        }
        ForgeProbe.save(out.resolve("coverage.json"),coverage);
        int humanSeatCount=0,aiSeatCount=0;boolean hasApiPilots=false;
        for(JsonElement entry:pod.getAsJsonArray("seats")){
            JsonObject seat=entry.getAsJsonObject();String kind=seat.has("kind")?seat.get("kind").getAsString():"human";
            if(kind.equals("ai")){aiSeatCount++;if(seat.has("pilot")&&seat.getAsJsonObject("pilot").has("kind")&&seat.getAsJsonObject("pilot").get("kind").getAsString().equals("api"))hasApiPilots=true;}
            else humanSeatCount++;
        }
        final int reportedHumanSeats=humanSeatCount,reportedAiSeats=aiSeatCount;final boolean reportedApiPilots=hasApiPilots;
        HostedMatch hosted=GuiBase.getInterface().hostMatch();
        if(humanBridges.isEmpty())throw new IllegalArgumentException("At least one browser seat required");
        Map<RegisteredPlayer,IGuiGame> guis=new LinkedHashMap<>();AtomicBoolean attached=new AtomicBoolean();
        SwingUtilities.invokeAndWait(()->{for(var entry:humanBridges.entrySet()){
            var browserBridge=entry.getValue();
            IGuiGame nativeGui=GuiBase.getInterface().getNewGuiGame();
            AtomicReference<forge.game.GameView> browserGameView=new AtomicReference<>();
            IGuiGame gui=(IGuiGame)Proxy.newProxyInstance(IGuiGame.class.getClassLoader(),new Class<?>[]{IGuiGame.class},(proxy,method,arguments)->{
              if(method.getName().equals("hashCode"))return System.identityHashCode(proxy);
              if(method.getName().equals("equals"))return proxy==arguments[0];
              if(method.isDefault())return java.lang.reflect.InvocationHandler.invokeDefault(proxy,method,arguments);
              Object[] values=arguments==null?new Object[0]:arguments;
              browserBridge.observe(method.getName(),values);
              if(method.getName().equals("openView")){
                // Attach before HostedMatch schedules opening draws and mulligan choices.
                if(attached.compareAndSet(false,true)){
                  journal.game=hosted.getGame();journal.game.subscribeToEvents(journal);
                  journal.append("manifest",ForgeProbe.obj("engineCommit",ForgeProbe.ENGINE,"mode","browser-seats-native-ai","telemetryVersion",3,"measured",false,"matchId",pod.get("matchId").getAsString(),"podHash",pod.get("podHash").getAsString(),"seed",pod.get("seed").getAsLong()));
                }
                browserBridge.attach(hosted.getGame());
              }
              Object choice=browserBridge.choice(method.getName(),values);
              if(choice!=ForgeBrowserBridge.DELEGATE)return choice;
              if(browserBridge.seatId!=0){
                // Remote/API seats need Forge's controller lifecycle without opening a second
                // desktop match view. State setters and render notifications are represented by
                // the bridge; unrepresented value-returning calls still fail closed.
                switch(method.getName()){
                  case "setGameView":browserGameView.set(values.length==0?null:(forge.game.GameView)values[0]);return null;
                  case "getGameView":return browserGameView.get();
                  case "getGamestate":return null;
                  case "isSelecting":return browserBridge.isSelecting();
                  case "isGamePaused":case "isUiSetToSkipPhase":case "isNetGame":return false;
                  case "getGameSpeed":return forge.gui.control.PlaybackSpeed.NORMAL;
                  case "getDayTime":return null;
                  case "tempShowZones":return values[1];
                }
                if(method.getReturnType()==Void.TYPE)return null;
                throw new UnsupportedOperationException("This invited seat received a Forge choice that CrankMagic Online cannot yet represent safely: "+method.getName());
              }
              try{return method.invoke(nativeGui,arguments);}catch(InvocationTargetException e){throw e.getCause();}
            });
            guis.put(entry.getKey(),gui);
        }});
        hosted.setStartGameHook(()->{
            try{ForgeProbe.save(out.resolve("live-status.json"),ForgeProbe.obj("status","playing","humanSeats",reportedHumanSeats,"aiSeats",reportedAiSeats,"interface","browser-with-native-fallback","apiPilots",reportedApiPilots));}catch(Exception e){throw new RuntimeException(e);}
            System.out.println("COMMANDER_LIVE_READY");System.out.flush();
        });
        hosted.setEndGameHook(()->{try{
            Game g=hosted.getGame();journal.durable();
            ForgeProbe.save(out.resolve("rng.json"),rng.tape);
            ForgeProbe.save(out.resolve("final-projection.json"),ForgeProbe.projection(g,null));
            for(Player p:g.getRegisteredPlayers())ForgeProbe.save(out.resolve("seat-"+p.getId()+".json"),ForgeProbe.projection(g,p));
            ForgeProbe.save(out.resolve("summary.json"),ForgeProbe.obj("status",g.isGameOver()?"finished":"incomplete","completedAt",java.time.Instant.now().toString(),"measured",false,"mode",reportedApiPilots?"browser-with-api-pilots":"human-vs-native-ai","outcome",g.getOutcome()==null?null:g.getOutcome().getOutcomeStrings(),"eventCount",journal.sequence));
        }catch(Exception e){throw new RuntimeException(e);}});
        GameRules rules=new GameRules(GameType.Commander);rules.setGamesPerMatch(1);rules.setAllowCheatShuffle(false);
        SwingUtilities.invokeAndWait(()->hosted.startMatch(rules,EnumSet.of(GameType.Commander),players,guis,null));
        if(pod.has("testFixture")&&pod.get("testFixture").getAsBoolean()){
          Thread diagnostic=new Thread(()->{try{while(true){
            List<Object> inputs=new ArrayList<>();for(var p:hosted.getGame().getRegisteredPlayers())if(p.getController() instanceof forge.player.PlayerControllerHuman h){
              var bridge=bridges.stream().filter(b->b.seatId==p.getId()).findFirst().orElseThrow();
              inputs.add(ForgeProbe.obj("seat",p.getId(),"sameController",h==bridge.controller,"sameGui",h.getGui()==guis.get(p.getRegisteredPlayer()),"input",String.valueOf(h.getInputQueue().getInput()),"proxyInput",String.valueOf(h.getInputProxy().getInput())));
            }
            ForgeProbe.save(out.resolve("proof-inputs.json"),inputs);Thread.sleep(1000);
          }}catch(Exception ignored){}},"proof-diagnostic");diagnostic.setDaemon(true);diagnostic.start();
        }
        if(!Files.exists(out.resolve("live-status.json")))ForgeProbe.save(out.resolve("live-status.json"),ForgeProbe.obj("status","ready","humanSeats",reportedHumanSeats,"aiSeats",reportedAiSeats,"interface","browser-with-native-fallback","apiPilots",reportedApiPilots));
    }
}
