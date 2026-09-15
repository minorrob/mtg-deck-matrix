/* SPDX-License-Identifier: GPL-3.0-or-later */
package crankmagic;

import forge.GuiDesktop;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.*;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.*;
import forge.game.zone.ZoneType;
import forge.gui.GuiBase;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import java.nio.file.*;
import java.util.*;

/** Regression checks against the actual engine, including exceptions to numeric loss thresholds. */
public final class RulesProbe {
    static final List<String> passed=new ArrayList<>();
    static void check(boolean value,String name) { if(!value) throw new AssertionError(name); passed.add(name); }
    static Game fresh() {
        List<RegisteredPlayer> players=new ArrayList<>();
        for(int i=0;i<4;i++) players.add(new RegisteredPlayer(new Deck("Rules seat "+i)).setPlayer(new LobbyPlayerAi("Seat "+i,Set.of())));
        GameRules rules=new GameRules(GameType.Commander);rules.setAppliedVariants(EnumSet.of(GameType.Commander));
        Game g=new Match(rules,players,"CrankMagic loss-rules fixture").createGame();g.setNoGUIUser();g.setAge(GameStage.Play);
        for(Player p:g.getPlayers()) p.setLife(40,null);
        g.getPhaseHandler().devModeSet(PhaseType.MAIN1,g.getPlayers().get(0),1);
        return g;
    }
    static Card put(Game g,int owner,String name,ZoneType zone) {
        Player p=g.getPlayers().get(owner);Card c=Card.fromPaperCard(FModel.getMagicDb().getCommonCards().getCard(name),p);
        p.getZone(zone).add(c);return c;
    }
    static Card commander(Game g,int owner,String name) {
        Card c=put(g,owner,name,ZoneType.Battlefield);g.getPlayers().get(owner).addCommander(c);return c;
    }
    public static void main(String[] args) throws Exception {
        String assets=System.getProperty("crankmagic.forgeAssets");
        GuiBase.setInterface(new GuiDesktop(){@Override public String getAssetsDir(){return assets;}});
        FModel.initialize(null,p->{p.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY,true);p.setPref(FPref.DECKGEN_CARDBASED,false);return null;});
        Game g=fresh();Player p=g.getPlayers().get(0);
        p.setLife(1,null);check(!p.checkLoseCondition(),"One life remains playable");
        p.setLife(0,null);check(p.checkLoseCondition()&&p.getOutcome().lossState==GameLossReason.LifeReachedZero,"Zero life loses");
        g=fresh();p=g.getPlayers().get(0);p.setLife(-4,null);check(p.checkLoseCondition(),"Negative life loses");
        g=fresh();p=g.getPlayers().get(0);p.setPoisonCounters(9,g.getPlayers().get(1));
        check(!p.checkLoseCondition(),"Nine poison does not lose");p.setPoisonCounters(10,g.getPlayers().get(1));
        check(p.checkLoseCondition()&&p.getOutcome().lossState==GameLossReason.Poisoned,"Ten poison loses at positive life");
        g=fresh();p=g.getPlayers().get(0);Card a=commander(g,1,"Krenko, Mob Boss"),b=commander(g,2,"Atraxa, Praetors' Voice");
        p.addCommanderDamage(a,11);p.addCommanderDamage(b,10);
        check(!p.checkLoseCondition(),"Damage from different commanders is not pooled in standard Commander");
        p.setLife(80,null);check(p.getCommanderDamage(a)==11,"Life gain does not erase commander damage");
        p.addCommanderDamage(a,9);check(!p.checkLoseCondition(),"Twenty from one commander does not lose");
        p.addCommanderDamage(a,1);check(p.checkLoseCondition()&&p.getOutcome().lossState==GameLossReason.CommanderDamage,"Twenty-one from the same commander loses");
        g=fresh();p=g.getPlayers().get(0);a=commander(g,1,"Krenko, Mob Boss");
        p.addDamageAfterPrevention(3,a,null,false,new GameEntityCounterTable());
        check(p.getCommanderDamage(a)==0,"Noncombat commander damage does not increase commander tally");
        p.addDamageAfterPrevention(3,a,null,true,new GameEntityCounterTable());
        check(p.getCommanderDamage(a)==3,"Combat damage increases the originating commander tally");
        g=fresh();p=g.getPlayers().get(0);check(!p.checkLoseCondition(),"An empty library alone does not lose");
        p.drawCards(1);check(p.checkLoseCondition()&&p.getOutcome().lossState==GameLossReason.Milled,"Attempting to draw from an empty library loses");
        g=fresh();p=g.getPlayers().get(0);Card angel=put(g,0,"Platinum Angel",ZoneType.Battlefield);
        p.setLife(0,null);check(!p.checkLoseCondition(),"Platinum Angel prevents life-threshold loss");
        p.setPoisonCounters(10,g.getPlayers().get(1));a=commander(g,1,"Krenko, Mob Boss");p.addCommanderDamage(a,21);
        check(!p.checkLoseCondition(),"Cannot-lose effect also protects poison and commander thresholds");
        p.concede();check(p.conceded(),"Concession still works while protected by Platinum Angel");
        g=fresh();p=g.getPlayers().get(0);put(g,0,"Grizzly Bears",ZoneType.Battlefield);p.setLife(0,null);
        g.getAction().checkStateEffects(true);
        check(p.hasLost()&&g.getPlayers().size()==3,"State-based checks remove the eliminated seat while three opponents continue");
        check(g.getCardsIn(ZoneType.Battlefield).isEmpty(),"An eliminated player's owned permanent leaves the game");
        g=fresh();p=g.getPlayers().get(0);check(p.loseConditionMet(GameLossReason.SpellEffect,"fixture")&&p.hasLost(),"Card effects can cause loss independently of thresholds");
        Path out=Path.of(args[0]);Files.createDirectories(out);
        ForgeProbe.save(out.resolve("loss-rules.json"),ForgeProbe.obj("schema","CommanderRulesEvidence@1","engineCommit",ForgeProbe.ENGINE,
            "passed",passed,"count",passed.size(),"rules","104.3, 704.5, 903.10, 800.4",
            "limitations",List.of("Pooled commander damage is a requested house rule, not enabled in this engine adapter.",
                "These are focused regression fixtures, not certification of all alternate win/loss cards.")));
        System.out.println("COMMANDER_RULES "+ForgeProbe.JSON.toJson(passed));System.exit(0);
    }
}
