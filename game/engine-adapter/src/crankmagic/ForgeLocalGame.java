/* SPDX-License-Identifier: GPL-3.0-or-later */
package crankmagic;

import com.google.gson.*;
import forge.GuiDesktop;
import forge.Singletons;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.*;
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
        var browserBridge=new ForgeBrowserBridge(out,journal);
        AtomicBoolean closed=new AtomicBoolean();
        Runtime.getRuntime().addShutdownHook(new Thread(()->{try{if(closed.compareAndSet(false,true))journal.close();}catch(Exception e){e.printStackTrace();}}));
        List<RegisteredPlayer> players=new ArrayList<>();List<Object> coverage=new ArrayList<>();RegisteredPlayer human=null;
        for(JsonElement entry:pod.getAsJsonArray("seats")){
            JsonObject seat=entry.getAsJsonObject();Deck deck=ForgeProbe.deck(seat.getAsJsonObject("deck"),coverage);
            String problem=GameType.Commander.getDeckFormat().getDeckConformanceProblem(deck);
            if(problem!=null)throw new IllegalArgumentException(deck.getName()+": "+problem);
            RegisteredPlayer rp=RegisteredPlayer.forCommander(deck);
            if(seat.get("seatId").getAsInt()==0){rp.setPlayer(new LobbyPlayerHuman(humanName));human=rp;}
            else{LobbyPlayerAi ai=new LobbyPlayerAi(seat.get("name").getAsString(),Set.of());ai.setAiProfile(seat.get("nativeProfile").getAsString());rp.setPlayer(ai);}
            players.add(rp);
        }
        ForgeProbe.save(out.resolve("coverage.json"),coverage);
        HostedMatch hosted=GuiBase.getInterface().hostMatch();
        IGuiGame[] gui=new IGuiGame[1];SwingUtilities.invokeAndWait(()->{
            IGuiGame nativeGui=GuiBase.getInterface().getNewGuiGame();
            gui[0]=(IGuiGame)Proxy.newProxyInstance(IGuiGame.class.getClassLoader(),new Class<?>[]{IGuiGame.class},(proxy,method,arguments)->{
              if(method.isDefault())return java.lang.reflect.InvocationHandler.invokeDefault(proxy,method,arguments);
              Object[] values=arguments==null?new Object[0]:arguments;
              browserBridge.observe(method.getName(),values);
              if(method.getName().equals("openView")){
                // Attach before HostedMatch schedules opening draws and mulligan choices.
                journal.game=hosted.getGame();journal.game.subscribeToEvents(journal);
                browserBridge.attach(hosted.getGame());
                journal.append("manifest",ForgeProbe.obj("engineCommit",ForgeProbe.ENGINE,"mode","human-vs-native-ai","telemetryVersion",2,"measured",false,"podHash",pod.get("podHash").getAsString()));
              }
              Object choice=browserBridge.choice(method.getName(),values);
              if(choice!=ForgeBrowserBridge.DELEGATE)return choice;
              try{return method.invoke(nativeGui,arguments);}catch(InvocationTargetException e){throw e.getCause();}
            });
        });
        hosted.setStartGameHook(()->{
            try{ForgeProbe.save(out.resolve("live-status.json"),ForgeProbe.obj("status","playing","humanSeats",1,"aiSeats",players.size()-1,"interface","browser-with-native-fallback","apiPilots",false));}catch(Exception e){throw new RuntimeException(e);}
            System.out.println("COMMANDER_LIVE_READY");System.out.flush();
        });
        hosted.setEndGameHook(()->{try{
            Game g=hosted.getGame();journal.durable();
            ForgeProbe.save(out.resolve("rng.json"),rng.tape);
            ForgeProbe.save(out.resolve("summary.json"),ForgeProbe.obj("status",g.isGameOver()?"finished":"incomplete","measured",false,"mode","human-vs-native-ai","outcome",g.getOutcome()==null?null:g.getOutcome().getOutcomeStrings(),"eventCount",journal.sequence));
        }catch(Exception e){throw new RuntimeException(e);}});
        GameRules rules=new GameRules(GameType.Commander);rules.setGamesPerMatch(1);rules.setAllowCheatShuffle(false);
        RegisteredPlayer humanSeat=human;
        SwingUtilities.invokeAndWait(()->hosted.startMatch(rules,EnumSet.of(GameType.Commander),players,humanSeat,gui[0]));
        if(!Files.exists(out.resolve("live-status.json")))ForgeProbe.save(out.resolve("live-status.json"),ForgeProbe.obj("status","ready","humanSeats",1,"aiSeats",players.size()-1,"interface","forge-native","apiPilots",false));
    }
}
