/* SPDX-License-Identifier: GPL-3.0-or-later */
package crankmagic;

import com.google.gson.*;
import forge.GuiDesktop;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.PlayerControllerHuman;
import forge.util.collect.FCollection;
import java.lang.reflect.Proxy;
import java.nio.file.*;
import java.util.*;
import javax.swing.SwingUtilities;

/** Real Forge input/controller/action regression; no running match is modified. */
public final class HiddenSelectionCheck {
    static int checks;
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);checks++;}
    static JsonObject click(ForgeBrowserBridge bridge,Card card){
        JsonObject request=new JsonObject();request.addProperty("kind","card");request.addProperty("targetId",card.getId());
        request.addProperty("revision",bridge.revision);request.addProperty("actionId",UUID.randomUUID().toString());return request;
    }
    static void apply(ForgeBrowserBridge bridge,JsonObject request,String status)throws Exception{
        bridge.action(request);SwingUtilities.invokeAndWait(()->{});
        check(Objects.equals(bridge.lastAction.get("id"),request.get("actionId").getAsString())&&Objects.equals(bridge.lastAction.get("status"),status),"Wrong final action outcome: "+bridge.lastAction);
    }
    public static void main(String[] args)throws Exception{
        String assets=System.getProperty("crankmagic.forgeAssets");
        GuiBase.setInterface(new GuiDesktop(){@Override public String getAssetsDir(){return assets;}});
        FModel.initialize(null,p->{p.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY,true);p.setPref(FPref.DECKGEN_CARDBASED,false);return null;});
        Path out=Path.of(args[0]);Files.createDirectories(out);
        try(ForgeProbe.Journal journal=new ForgeProbe.Journal(out.resolve("events.ndjson"))){
            Game game=RulesProbe.fresh();journal.game=game;
            ForgeBrowserBridge bridge=new ForgeBrowserBridge(out,journal);
            try{
                var player=game.getPlayers().get(0);
                PlayerControllerHuman human=new PlayerControllerHuman(game,player,player.getLobbyPlayer());
                bridge.controller=human;
                human.setGui((IGuiGame)Proxy.newProxyInstance(IGuiGame.class.getClassLoader(),new Class<?>[]{IGuiGame.class},(proxy,method,values)->{
                    Object[] supplied=values==null?new Object[0]:values;
                    bridge.observe(method.getName(),supplied);
                    if(method.getName().equals("tempShowZones"))return supplied[1];
                    if(method.getReturnType()==boolean.class)return false;
                    if(method.getReturnType()==int.class)return 0;
                    return null;
                }));
                bridge.attach(game);
                Card first=RulesProbe.put(game,0,"Forest",ZoneType.Library),second=RulesProbe.put(game,0,"Forest",ZoneType.Library);
                Card unoffered=RulesProbe.put(game,0,"Island",ZoneType.Library),opponent=RulesProbe.put(game,1,"Forest",ZoneType.Library);
                Card privateHand=RulesProbe.put(game,1,"Forest",ZoneType.Hand);
                var input=new InputSelectEntitiesFromList<Card>(human,1,2,new FCollection<Card>(List.of(first,second)));
                human.getInputQueue().setInput(input);SwingUtilities.invokeAndWait(()->{});
                check(bridge.selectables.equals(List.of(first.getId(),second.getId())),"Offered IDs were changed");
                apply(bridge,click(bridge,unoffered),"error");apply(bridge,click(bridge,opponent),"error");apply(bridge,click(bridge,privateHand),"error");
                check(input.getSelected().isEmpty(),"Unadvertised private card was selected");
                JsonObject request=click(bridge,second);apply(bridge,request,"completed");
                check(input.getSelected().size()==1&&input.getFirstSelected()==second,"Same-name card identity was lost");
                long revision=bridge.revision;bridge.action(request.deepCopy());SwingUtilities.invokeAndWait(()->{});
                check(bridge.revision==revision&&input.getFirstSelected()==second,"Retry toggled the selected card");
                apply(bridge,click(bridge,first),"completed");
                check(input.getSelected().size()==2,"Second library selection did not reach Forge");
                human.getInputQueue().clearInputs();
                var next=new InputSelectEntitiesFromList<Card>(human,1,1,new FCollection<Card>(List.of(unoffered)));
                human.getInputQueue().setInput(next);SwingUtilities.invokeAndWait(()->{});
                apply(bridge,click(bridge,second),"error");
                check(next.getSelected().isEmpty(),"Expired offered card retained authorization");
                bridge.snapshot();JsonObject projection=ForgeProbe.JSON.toJsonTree(bridge.projection).getAsJsonObject();
                for(JsonElement p:projection.getAsJsonArray("players")){
                    JsonObject zones=p.getAsJsonObject().getAsJsonObject("zones");
                    check(zones.getAsJsonObject("Library").getAsJsonArray("cards").isEmpty(),"Library order leaked");
                    if(p.getAsJsonObject().get("playerId").getAsInt()!=0)check(zones.getAsJsonObject("Hand").getAsJsonArray("cards").isEmpty(),"Opponent hand leaked");
                }
                apply(bridge,click(bridge,unoffered),"completed");
                check(next.getFirstSelected()==unoffered,"Next decision could not select its own offered card");
            }finally{bridge.server.stop(0);}
        }
        ForgeProbe.save(out.resolve("hidden-selection.json"),ForgeProbe.obj("passed",true,"checks",checks,"engineCommit",ForgeProbe.ENGINE));
        System.out.println("HIDDEN_SELECTION_CHECKS "+checks);System.exit(0);
    }
}
