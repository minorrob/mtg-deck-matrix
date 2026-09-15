package crankmagic;

import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.game.keyword.KeywordCollection;
import forge.game.zone.ZoneType;
import forge.trackable.TrackableProperty;
import forge.trackable.TrackableCollection;
import java.nio.file.*;
import java.util.*;

/** Isolated, explicitly synthetic browser UAT for the real Forge damage-choice contract. */
public final class BrowserContractScenario {
    static Map<String,Object> card(int id,String name,int power,int toughness,int player) {
        return ForgeProbe.obj("cardId",id,"name",name,"typeLine","Creature","power",power,"toughness",toughness,"owner",player,"controller",player,"tapped",false,"faceDown",false,"token",false,"counters",Map.of(),"damage",0);
    }
    static Map<String,Object> player(int id,String name,List<Object> cards) {
        Map<String,Object> zones=new LinkedHashMap<>();
        for(String zone:List.of("Hand","Library","Battlefield","Graveyard","Exile","Command"))zones.put(zone,ForgeProbe.obj("count",zone.equals("Battlefield")?cards.size():0,"hiddenCount",0,"cards",zone.equals("Battlefield")?cards:List.of()));
        return ForgeProbe.obj("playerId",id,"name",name,"life",40,"mana",List.of(),"counters",Map.of(),"zones",zones,"health",ForgeProbe.obj("life",40,"poison",0,"commanderDamageMax",0,"commanderDamageTotal",0,"commanderDamage",List.of(),"status","active"));
    }
    public static void main(String[] args)throws Exception {
        if(args.length!=1)throw new IllegalArgumentException("isolated output directory required");
        Path out=Path.of(args[0]);Files.createDirectories(out);
        forge.util.Lang.createInstance("en-US");
        try(var journal=new ForgeProbe.Journal(out.resolve("events.ndjson"))) {
            var bridge=new ForgeBrowserBridge(out,journal);
            try {
                var source=new CardView(700,null,"Goblin Piledriver");
                var keywords=new KeywordCollection();keywords.add("Trample");source.getCurrentState().set(TrackableProperty.Keywords,keywords.getView());
                var first=new CardView(701,null,"Wall of Omens");first.set(TrackableProperty.LethalDamage,2);first.set(TrackableProperty.Zone,ZoneType.Battlefield);
                var second=new CardView(702,null,"Weathered Sentinels");second.set(TrackableProperty.LethalDamage,3);second.set(TrackableProperty.Zone,ZoneType.Battlefield);
                var secret=new CardView(703,null,"PRIVATE FIXTURE CARD");secret.set(TrackableProperty.Zone,ZoneType.Hand);
                var defender=new PlayerView(1,null);defender.set(TrackableProperty.Name,"UAT opponent");
                var targetCards=new TrackableCollection<CardView>();targetCards.add(first);targetCards.add(secret);
                var targetPlayers=new TrackableCollection<PlayerView>();targetPlayers.add(defender);
                var spell=new StackItemView(900,null);spell.set(TrackableProperty.TargetCards,targetCards);spell.set(TrackableProperty.TargetPlayers,targetPlayers);
                var targets=ForgeProbe.stackTargets(spell,null);
                if(ForgeProbe.JSON.toJson(targets).contains("PRIVATE FIXTURE CARD"))throw new AssertionError("Hidden target leaked");
                var attacker=card(700,"Goblin Piledriver",7,2,0);attacker.put("keywords",List.of("trample"));
                var blocker1=card(701,"Wall of Omens",2,2,1);var blocker2=card(702,"Weathered Sentinels",3,3,1);
                bridge.projection=ForgeProbe.obj("turn",1,"phase","COMBAT_DAMAGE","turnPlayerId",0,"priorityPlayerId",0,"gameOver",false,
                    "players",List.of(player(0,"UAT fixture — not a real match",List.of(attacker)),player(1,"UAT opponent",List.of(blocker1,blocker2))),
                    "stackSize",1,"stack",List.of(ForgeProbe.obj("stackId",900,"cardId",901,"name","Despark","kind","spell","stage","stack","targets",targets)),
                    "combat",ForgeProbe.obj("turn",1,"attackingPlayerId",0,"defenders",List.of(ForgeProbe.obj("playerId",1,"name","UAT opponent")),"attacks",List.of(ForgeProbe.obj("attacker",attacker,"defender",ForgeProbe.obj("playerId",1,"name","UAT opponent"),"blocked",true,"blockers",List.of(blocker1,blocker2)))));
                bridge.prompt="Synthetic contract test: assign seven damage across two blockers and the defender.";
                ForgeProbe.save(out.resolve("live-status.json"),ForgeProbe.obj("status","playing","testFixture",true));
                var result=(Map<?,?>)bridge.assignCombatDamage(new Object[]{source,List.of(first,second),7,defender,false,false});
                if(!Integer.valueOf(2).equals(result.get(first))||!Integer.valueOf(3).equals(result.get(second))||!Integer.valueOf(2).equals(result.get(null)))throw new AssertionError("Damage identity/allocation changed across browser transport");
                ForgeProbe.save(out.resolve("contract-result.json"),ForgeProbe.obj("passed",true,"damage",List.of(2,3,2),"targetPrivacy",true,"synthetic",true));
                synchronized(bridge){bridge.prompt="Contract check passed: exact 2 / 3 / 2 assignment returned to Forge.";bridge.revision++;}
                System.out.println("BROWSER_CONTRACT_PASSED");System.out.flush();
                Thread.sleep(60000);
            }finally{bridge.server.stop(0);}
        }
    }
}
