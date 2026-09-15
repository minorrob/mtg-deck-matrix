/* SPDX-License-Identifier: GPL-3.0-or-later
 * Experimental adapter to the Forge revision in forge.lock.json. No production rules claims.
 */
package crankmagic;

import com.google.common.eventbus.Subscribe;
import com.google.gson.*;
import forge.GuiDesktop;
import forge.LobbyPlayer;
import forge.ai.LobbyPlayerAi;
import forge.ai.PlayerControllerAi;
import forge.card.CardRules;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.*;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.event.*;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityView;
import forge.game.spellability.StackItemView;
import forge.game.zone.ZoneType;
import forge.gui.GuiBase;
import forge.item.PaperCard;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.util.MyRandom;

import java.io.*;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Four real decks, engine events, visibility projections and a recorded RNG seam.
 * Native AI is an integration driver only: its decisions are not yet certified fair or replayable.
 */
public final class ForgeProbe {
    static final Gson JSON = new GsonBuilder().disableHtmlEscaping().serializeNulls().create();
    static final String ENGINE = "58bcd59062a3b44019195a3c25d6ab41a7fe2f61";
    static TapeRandom activeRandom;
    static Map<String,Object> obj(Object... pairs) {
        Map<String,Object> m = new TreeMap<>();
        for (int i=0;i<pairs.length;i+=2) m.put((String)pairs[i],pairs[i+1]);
        return m;
    }
    static String hash(Object value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.toJson(value).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    static void save(Path file, Object value) throws IOException {
        Files.writeString(file,JSON.toJson(value)+"\n",StandardCharsets.UTF_8);
    }
    static void saveDurable(Path file,Object value) throws IOException {
        try(FileOutputStream out=new FileOutputStream(file.toFile())) {
            out.write((JSON.toJson(value)+"\n").getBytes(StandardCharsets.UTF_8));out.getChannel().force(true);
        }
    }

    /** Record primitive RNG requests, including rejection-sampling draws made by java.util.Random. */
    static final class TapeRandom extends Random {
        final List<List<Integer>> tape = new ArrayList<>();
        final JsonArray replay;
        final boolean prefix=Boolean.getBoolean("crankmagic.rngPrefix");
        volatile IllegalStateException failure;
        int cursor;
        TapeRandom(long seed, JsonArray replay) { super(seed); this.replay=replay; }
        @Override protected synchronized int next(int bits) {
            int n;
            if(failure!=null) throw failure;
            if (replay != null && (!prefix || cursor<replay.size())) {
                if (cursor >= replay.size()) throw (failure=new IllegalStateException("RNG tape exhausted at " + cursor));
                JsonArray row = replay.get(cursor).getAsJsonArray();
                if (row.get(0).getAsInt()!=bits) throw (failure=new IllegalStateException("RNG request diverged at " + cursor));
                super.next(bits); // Preserve the seeded generator's position for pending-choice recovery.
                n=row.get(1).getAsInt();
            } else n=super.next(bits);
            tape.add(List.of(bits,n)); cursor++;
            return n;
        }
    }

    /** This file contains engine-private information; it must never be used as an AI observation. */
    static final class Journal implements AutoCloseable {
        final FileOutputStream output;
        final Path directory;
        final Map<String,Integer> counts = new TreeMap<>();
        final List<String> projectionHashes = new ArrayList<>();
        final Map<Integer,String> castEvents = new HashMap<>();
        Game game;
        long sequence;
        Throwable failure;
        Journal(Path file) throws IOException { output=new FileOutputStream(file.toFile());directory=file.getParent(); }
        synchronized String append(String kind, Object payload) {
            String id="event:"+(++sequence);
            try {
                output.write((JSON.toJson(obj("schema","CommanderProbeEvent@1","eventId",id,"sequence",sequence,
                    "visibility","engine-private","kind",kind,"data",payload))+"\n").getBytes(StandardCharsets.UTF_8));
                output.flush();
            } catch (IOException e) { throw new UncheckedIOException(e); }
            return id;
        }
        void durable() throws IOException {
            output.getChannel().force(true);
            if(activeRandom!=null) saveDurable(directory.resolve("rng-prefix.json"),activeRandom.tape);
        }
        @Subscribe public void event(GameEvent event) {
            // Guava's event bus swallows subscriber exceptions. Save and fail the run explicitly.
            try {
                String type=event.getClass().getSimpleName();
                counts.merge(type,1,Integer::sum);
                Map<String,Object> data=obj("turn",game.getPhaseHandler().getTurn(),"phase",String.valueOf(game.getPhaseHandler().getPhase()),"fields",capture(event));
                if (event instanceof GameEventSpellResolved e) data.put("castEventId",castEvents.get(e.spell().getId()));
                String id=append(type,data);
                if(event instanceof forge.game.event.GameEventCombatUpdate || event instanceof forge.game.event.GameEventAttackersDeclared || event instanceof forge.game.event.GameEventBlockersDeclared)
                    append("combat-state",obj("turn",game.getPhaseHandler().getTurn(),"phase",String.valueOf(game.getPhaseHandler().getPhase()),"combat",combatView(game)));
                if (event instanceof GameEventSpellAbilityCast e) castEvents.put(e.sa().getId(),id);
                if (event instanceof GameEventPlayerPriority || event instanceof GameEventTurnPhase || event instanceof GameEventGameOutcome) {
                    Map<String,Object> state=projection(game,null);
                    String h=hash(state); projectionHashes.add(h);
                    append("projection",obj("projectionHash",h,"state",event instanceof GameEventPlayerPriority?null:state));
                }
            } catch (Throwable e) { failure=e; }
        }
        @Override public void close() throws IOException { durable(); output.close(); }
    }

    /** Closed serialization boundary: do not hand Gson an engine object graph. */
    static Object capture(Object v) {
        if (v==null || v instanceof String || v instanceof Number || v instanceof Boolean) return v;
        if (v instanceof Enum<?>) return v.toString();
        if (v instanceof CardView c) return obj("cardId",c.getId(),"name",c.getCurrentState().getName(),"faceDown",c.isFaceDown());
        if (v instanceof PlayerView p) return obj("playerId",p.getId(),"name",p.getName());
        if (v instanceof SpellAbilityView s) return obj("abilityId",s.getId(),"host",capture(s.getHostCard()),"description",s.getDescription(),"isSpell",s.isSpell());
        if (v instanceof StackItemView s) return obj("stackId",s.getId(),"source",capture(s.getSourceCard()),"actor",capture(s.getActivatingPlayer()),"isTrigger",s.isTrigger());
        if (v instanceof Card c) return capture(c.getView());
        if (v instanceof Player p) return capture(p.getView());
        if (v instanceof com.google.common.collect.Multimap<?,?> multimap) return capture(multimap.asMap());
        if (v instanceof Map<?,?> map) {
            List<Object> entries=new ArrayList<>();
            map.forEach((k,value)->entries.add(obj("key",capture(k),"value",capture(value))));
            entries.sort(Comparator.comparing(JSON::toJson)); return entries;
        }
        if (v instanceof Iterable<?> values) {
            List<Object> list=new ArrayList<>(); values.forEach(item->list.add(capture(item)));
            if (v instanceof Set<?>) list.sort(Comparator.comparing(JSON::toJson));
            return list;
        }
        if (v.getClass().isRecord()) {
            Map<String,Object> result=new TreeMap<>();
            try {
                for (RecordComponent c:v.getClass().getRecordComponents()) result.put(c.getName(),capture(c.getAccessor().invoke(v)));
            } catch (Exception e) { throw new IllegalStateException("Cannot capture " + v.getClass(),e); }
            return result;
        }
        return obj("uncapturedType",v.getClass().getName());
    }

    /** This is a diagnostic projection, NOT a complete restorable engine checkpoint. */
    static Map<String,Object> projection(Game game, Player viewer) {
        List<Object> players=new ArrayList<>();
        for (Player p:game.getRegisteredPlayers()) {
            Map<String,Object> zones=new TreeMap<>();
            for (ZoneType zone:List.of(ZoneType.Library,ZoneType.Hand,ZoneType.Battlefield,ZoneType.Graveyard,ZoneType.Exile,ZoneType.Command)) {
                List<Object> cards=new ArrayList<>(); int hidden=0,count=0;
                for (Card c:p.getCardsIn(zone)) {
                    if (viewer!=null && c.isImmutable()) continue;
                    count++;
                    CardView cv=c.getView();
                    if (viewer!=null && !cv.canBeShownTo(viewer.getView())) { hidden++; continue; }
                    boolean faceVisible=viewer==null || cv.canFaceDownBeShownTo(viewer.getView());
                    Map<String,Object> data=obj("cardId",c.getId(),"name",faceVisible?c.getName():null,
                        "token",c.isToken(),"commander",c.isCommander(),"engineEffect",c.isImmutable(),
                        "controller",c.getController().getId(),"owner",c.getOwner().getId(),"tapped",c.isTapped(),
                        "faceDown",c.isFaceDown(),"damage",c.getDamage(),"counters",capture(c.getCounters()));
                    if (faceVisible) { data.put("power",c.getNetPower()); data.put("toughness",c.getNetToughness()); data.put("typeLine",c.getType().toString()); }
                    cards.add(data);
                }
                zones.put(zone.name(),obj("count",count,"hiddenCount",hidden,"cards",cards));
            }
            List<Object> mana=new ArrayList<>();
            p.getManaPool().forEach(m->mana.add(obj("color",m.toString(),"sourceId",m.sourceCard().getId(),"restricted",m.isRestricted())));
            mana.sort(Comparator.comparing(JSON::toJson));
            players.add(obj("playerId",p.getId(),"name",p.getName(),"life",p.getLife(),"health",health(game,p),
                "counters",capture(p.getCounters()),"mana",mana,"zones",zones));
        }
        return obj("schema","CommanderProbeProjection@1","turn",game.getPhaseHandler().getTurn(),
            "turnPlayerId",game.getPhaseHandler().getPlayerTurn()==null?null:game.getPhaseHandler().getPlayerTurn().getId(),
            "priorityPlayerId",game.getPhaseHandler().getPriorityPlayer()==null?null:game.getPhaseHandler().getPriorityPlayer().getId(),
            "phase",String.valueOf(game.getPhaseHandler().getPhase()),"players",players,
            "combat",combatView(game),"stackSize",game.getStack().size(),"gameOver",game.isGameOver());
    }

    static Map<String,Object> combatView(Game game) {
        var combat=game.getCombat();if(combat==null)return null;
        List<Object> defenders=new ArrayList<>(),attacks=new ArrayList<>();
        for(var defender:combat.getDefenders())defenders.add(combatEntity(defender));
        for(Card attacker:combat.getAttackers()){
            List<Object> blockers=new ArrayList<>();for(Card blocker:combat.getBlockers(attacker))blockers.add(combatCard(blocker));
            attacks.add(obj("attacker",combatCard(attacker),"defender",combatEntity(combat.getDefenderByAttacker(attacker)),"blocked",combat.isBlocked(attacker),"blockers",blockers));
        }
        return obj("turn",game.getPhaseHandler().getTurn(),"attackingPlayerId",combat.getAttackingPlayer().getId(),"defenders",defenders,"attacks",attacks);
    }
    static Map<String,Object> combatEntity(forge.game.GameEntity entity) {
        if(entity instanceof Player p)return obj("kind","player","id",p.getId(),"name",p.getName());
        if(entity instanceof Card c)return obj("kind","card","id",c.getId(),"name",c.isFaceDown()?"Face-down card":c.getName());
        return null;
    }
    static Map<String,Object> combatCard(Card c) {
        List<String> keywords=new ArrayList<>();
        if(!c.isFaceDown())for(var keyword:List.of(forge.game.keyword.Keyword.FLYING,forge.game.keyword.Keyword.REACH,forge.game.keyword.Keyword.TRAMPLE,forge.game.keyword.Keyword.FIRST_STRIKE,forge.game.keyword.Keyword.DOUBLE_STRIKE,forge.game.keyword.Keyword.DEATHTOUCH,forge.game.keyword.Keyword.LIFELINK,forge.game.keyword.Keyword.INFECT,forge.game.keyword.Keyword.WITHER))if(c.hasKeyword(keyword))keywords.add(keyword.name().toLowerCase().replace('_',' '));
        return obj("cardId",c.getId(),"name",c.isFaceDown()?"Face-down card":c.getName(),"power",c.getNetPower(),"toughness",c.getNetToughness(),"damage",c.getDamage(),"commander",c.isCommander(),"keywords",keywords);
    }

    /** Display engine-authoritative results; thresholds alone cannot override 'can't lose' effects. */
    static Map<String,Object> health(Game game,Player defender) {
        List<Object> damage=new ArrayList<>(); int total=0,max=0;
        for(Player owner:game.getRegisteredPlayers()) for(Card commander:owner.getCommanders()) {
            int n=defender.getCommanderDamage(commander); total+=n; max=Math.max(max,n);
            damage.add(obj("commanderId",commander.getId(),"ownerSeatId",owner.getId(),"name",commander.getName(),
                "damage",n,"remaining",Math.max(0,21-n)));
        }
        return obj("life",defender.getLife(),"poison",defender.getPoisonCounters(),"poisonThreshold",10,
            "poisonRemaining",Math.max(0,10-defender.getPoisonCounters()),"commanderDamage",damage,
            "commanderDamageTotal",total,"commanderDamageMax",max,"commanderDamageRemaining",Math.max(0,21-max),
            "commanderDamageMode","per-commander","commanderDamageThreshold",21,
            "status",defender.hasLost()?"out":defender.getOutcome()!=null?(defender.getOutcome().hasWon()?"won":"draw"):"active",
            "lossReason",defender.hasLost()?defender.getOutcome().lossState.toString():null);
    }

    static final class ProbePlayer extends LobbyPlayerAi {
        final Journal journal;
        final int turnLimit;
        final boolean bridge;
        ProbePlayer(String name,Journal journal,int turnLimit,boolean bridge) {
            super(name,Set.of()); this.journal=journal; this.turnLimit=turnLimit; this.bridge=bridge;
            setAiProfile("Default");
        }
        @Override public Player createIngamePlayer(Game game,int id) {
            Player p=new Player(getName(),game,id);
            p.setFirstController(new ProbeController(game,p,this,journal,turnLimit,bridge));
            return p;
        }
    }
    static boolean cutoff;
    static final class ProbeController extends PlayerControllerAi {
        final Journal journal; final int turnLimit; final boolean bridge;
        ProbeController(Game g,Player p,LobbyPlayer lp,Journal j,int limit,boolean bridge) {
            super(g,p,lp); journal=j; turnLimit=limit; this.bridge=bridge;
        }
        @Override public List<SpellAbility> chooseSpellAbilityToPlay() {
            if(activeRandom!=null && activeRandom.failure!=null) throw activeRandom.failure;
            if (getPlayer().getGame().getPhaseHandler().getTurn()>turnLimit) {
                cutoff=true; getPlayer().getGame().setGameOver(GameEndReason.Draw); return null;
            }
            List<SpellAbility> selected=super.chooseSpellAbilityToPlay();
            if(activeRandom!=null && activeRandom.failure!=null) throw activeRandom.failure;
            if (selected!=null && !selected.isEmpty()) journal.append("native-pilot-choice",obj("seat",getPlayer().getId(),
                "certifiedFair",false,"abilities",selected.stream().map(s->obj("id",s.getId(),"card",capture(s.getHostCard()),"description",s.toString())).toList()));
            return selected;
        }
        @Override public Player chooseStartingPlayer(boolean first) {
            if (!bridge) return super.chooseStartingPlayer(first);
            List<Player> options=new ArrayList<>(); getPlayer().getGame().getPlayers().forEach(options::add);
            List<Object> choices=options.stream().map(p->(Object)obj("optionId","player:"+p.getId(),"label",p.getName())).toList();
            String decisionId="decision:start-player";
            Map<String,Object> decision=obj("schema","CommanderProbeDecision@1","decisionId",decisionId,
                "stateVersion",journal.sequence,"seatId",getPlayer().getId(),"kind","starting-player","options",choices,
                "observation",projection(getPlayer().getGame(),getPlayer()));
            journal.append("decision-request",decision);
            try {
                journal.durable();
                System.out.println("COMMANDER_DECISION "+JSON.toJson(decision)); System.out.flush();
                BufferedReader input=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8));
                while (true) {
                    String line=input.readLine(); if (line==null) throw new IllegalStateException("Input closed with a pending decision");
                    JsonObject answer;
                    try {
                        answer=JsonParser.parseString(line).getAsJsonObject();
                        if(!answer.has("decisionId")||!answer.has("stateVersion")||!answer.has("optionId")||
                            !answer.get("stateVersion").isJsonPrimitive()||!answer.get("stateVersion").getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException();
                    } catch(RuntimeException malformed) {System.out.println("COMMANDER_REJECT malformed-answer");continue;}
                    if (!decisionId.equals(answer.get("decisionId").getAsString()) || answer.get("stateVersion").getAsLong()!=((Number)decision.get("stateVersion")).longValue()) {
                        System.out.println("COMMANDER_REJECT stale-decision"); continue;
                    }
                    for (Player p:options) if (("player:"+p.getId()).equals(answer.get("optionId").getAsString())) {
                        journal.append("decision-answer",obj("decisionId",decisionId,"stateVersion",decision.get("stateVersion"),"optionId",answer.get("optionId").getAsString()));
                        journal.durable(); return p;
                    }
                    System.out.println("COMMANDER_REJECT illegal-option");
                }
            } catch(IOException e) { throw new UncheckedIOException(e); }
        }
    }

    static Deck deck(JsonObject snapshot,List<Object> coverage) {
        Deck deck=new Deck(snapshot.get("name").getAsString());
        for (String section:List.of("commanders","library")) for(JsonElement item:snapshot.getAsJsonArray(section)) {
            JsonObject row=item.getAsJsonObject(); String name=row.get("name").getAsString();
            PaperCard card=FModel.getMagicDb().getCommonCards().getCard(name);
            if(card==null && name.contains(" // ")) card=FModel.getMagicDb().getCommonCards().getCard(name.split(" // ")[0]);
            if(card==null) { coverage.add(obj("name",name,"status","missing")); continue; }
            CardRules rules=card.getRules();
            String full=rules.getMainPart().getName()+(rules.getOtherPart()==null?"":" // "+rules.getOtherPart().getName());
            if(!name.equals(rules.getName()) && !name.equals(full)) throw new IllegalStateException("Card face mismatch: "+name+" / "+full);
            coverage.add(obj("name",name,"oracleId",row.get("oracleId").getAsString(),"engineName",card.getName(),
                "status","definition-found","script",rules.getPath(),"abilityCoverage","unverified"));
            deck.getOrCreate(section.equals("commanders")?DeckSection.Commander:DeckSection.Main).add(card,row.get("quantity").getAsInt());
        }
        return deck;
    }
    public static void main(String[] args) throws Exception {
        if(args.length<4) throw new IllegalArgumentException("pod.json output-directory seed turn-limit [rng-replay.json] [bridge]");
        Path out=Path.of(args[1]); Files.createDirectories(out);
        JsonObject pod=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
        System.setProperty("java.awt.headless","true");
        final String assets=System.getProperty("crankmagic.forgeAssets");
        if(assets==null) throw new IllegalArgumentException("crankmagic.forgeAssets must point at pinned forge-gui/");
        GuiBase.setInterface(new GuiDesktop() { @Override public String getAssetsDir() { return assets; } });
        // Do not enter Forge Main: it starts remote crash reporting. Keep this proof local.
        FModel.initialize(null,prefs->{prefs.setPref(FPref.FILTERED_HANDS,false);prefs.setPref(FPref.DECKGEN_CARDBASED,false);
            prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY,true);prefs.setPref(FPref.MULLIGAN_RULE,"London");return null;});
        JsonArray replay=args.length>4 && !args[4].equals("-")?JsonParser.parseString(Files.readString(Path.of(args[4]))).getAsJsonArray():null;
        TapeRandom rng=new TapeRandom(Long.parseLong(args[2]),replay);activeRandom=rng; MyRandom.setRandom(rng);
        try(Journal journal=new Journal(out.resolve("events.ndjson"))) {
            List<RegisteredPlayer> registered=new ArrayList<>(); List<Object> coverage=new ArrayList<>();
            List<Object> deckChecks=new ArrayList<>();
            for(JsonElement seat:pod.getAsJsonArray("seats")) {
                JsonObject s=seat.getAsJsonObject(); Deck d=deck(s.getAsJsonObject("deck"),coverage);
                String problem=GameType.Commander.getDeckFormat().getDeckConformanceProblem(d);
                deckChecks.add(obj("name",d.getName(),"library",d.getMain().countAll(),"commanders",d.getCommanders().size(),"problem",problem));
                registered.add(RegisteredPlayer.forCommander(d).setPlayer(new ProbePlayer(d.getName(),journal,Integer.parseInt(args[3]),args.length>5 && args[5].equals("bridge"))));
            }
            save(out.resolve("coverage.json"),obj("engineCommit",ENGINE,"cards",coverage,"decks",deckChecks));
            if(deckChecks.stream().anyMatch(v->((Map<?,?>)v).get("problem")!=null)) throw new IllegalStateException("Deck conformance failed; see coverage.json");
            GameRules rules=new GameRules(GameType.Commander); rules.setAppliedVariants(EnumSet.of(GameType.Commander)); rules.setGamesPerMatch(1);
            Match match=new Match(rules,registered,"CrankMagic C0"); Game game=match.createGame(); game.setNoGUIUser();
            // A wall-clock native-AI timeout injects a pass and makes replay depend on machine load.
            // The parent watchdog aborts the entire probe if work stalls; it never invents a pass.
            game.AI_TIMEOUT=3600;
            journal.game=game; game.subscribeToEvents(journal);
            journal.append("manifest",obj("engineCommit",ENGINE,"podHash",pod.get("podHash").getAsString(),"seed",args[2],
                "pilot","forge-native-uncertified","measured",false,"filteredHands",false,"mulligan","London"));
            Throwable error=null;
            try { match.startGame(game); if(journal.failure!=null) throw new IllegalStateException("Event capture failed",journal.failure); }
            catch(Throwable t) { error=t; t.printStackTrace(); }
            save(out.resolve("rng.json"),rng.tape);
            save(out.resolve("projection-hashes.json"),journal.projectionHashes);
            save(out.resolve("final-projection.json"),projection(game,null));
            for(Player p:game.getRegisteredPlayers()) save(out.resolve("seat-"+p.getId()+".json"),projection(game,p));
            String status=error!=null?"engine-error":cutoff?"turn-limit":game.isGameOver()?"finished":"incomplete";
            Object summary=obj("schema","CommanderProbeResult@1","status",status,"measured",false,"engineCommit",ENGINE,
                "turn",game.getPhaseHandler().getTurn(),"eventCount",journal.sequence,"eventKinds",journal.counts,
                "rngDraws",rng.cursor,"rngTapeFullyConsumed",replay==null?null:rng.cursor==replay.size(),
                "projectionHash",hash(projection(game,null)),"projectionSequenceHash",hash(journal.projectionHashes),
                "outcome",!cutoff && game.getOutcome()!=null?game.getOutcome().getOutcomeStrings():null,
                "failure",error==null?null:error.toString());
            save(out.resolve("summary.json"),summary); System.out.println("COMMANDER_RESULT "+JSON.toJson(summary));
            if(error!=null) System.exit(2);
        }
        System.exit(0);
    }
}
