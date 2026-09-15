package crankmagic;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

/** Exercises the live bridge's real answer validation without changing a user's match. */
public final class BridgeProtocolCheck {
    static int checks;
    interface Attempt { void run() throws Exception; }
    static void rejected(Attempt attempt) throws Exception {
        try { attempt.run(); } catch (IllegalArgumentException expected) { checks++; return; }
        throw new AssertionError("Invalid action was accepted");
    }
    static JsonObject answer(ForgeBrowserBridge bridge,String choice,int... indices) {
        JsonObject request=new JsonObject();request.addProperty("kind","answer");request.addProperty("actionId",UUID.randomUUID().toString());
        request.addProperty("revision",bridge.revision);request.addProperty("choiceId",choice);
        JsonArray values=new JsonArray();for(int i:indices)values.add(i);request.add("indices",values);return request;
    }
    public static void main(String[] args) throws Exception {
        Path directory=Files.createTempDirectory("crankmagic-bridge-contract-");
        try(ForgeProbe.Journal journal=new ForgeProbe.Journal(directory.resolve("events.ndjson"))) {
            ForgeBrowserBridge bridge=new ForgeBrowserBridge(directory,journal);
            try {
                bridge.pending=ForgeProbe.obj("id","order-1","mode","order","min",2,"max",2,"options",List.of("first","second"));
                JsonObject stale=answer(bridge,"order-1",0,1);stale.addProperty("revision",-1);rejected(()->bridge.action(stale));
                rejected(()->bridge.action(answer(bridge,"expired",0,1)));
                rejected(()->bridge.action(answer(bridge,"order-1",0,0)));
                rejected(()->bridge.action(answer(bridge,"order-1",0,2)));
                rejected(()->bridge.action(answer(bridge,"order-1",0)));
                JsonObject request=answer(bridge,"order-1",1,0);
                Map<String,Object> receipt=bridge.action(request);
                if(!bridge.answer.getAsJsonArray("indices").toString().equals("[1,0]"))throw new AssertionError("Order changed in transit");checks++;
                long revision=bridge.revision;
                if(!bridge.action(request.deepCopy()).equals(receipt)||bridge.revision!=revision)throw new AssertionError("Retry applied twice");checks++;
                JsonObject altered=request.deepCopy();altered.getAsJsonArray("indices").set(0,new JsonPrimitive(0));rejected(()->bridge.action(altered));
                bridge.answer=null;bridge.pending=ForgeProbe.obj("id","draw-1","mode","draw","min",0,"max",0,"options",List.of());
                JsonObject draw=answer(bridge,"draw-1");bridge.action(draw);checks++;
                rejected(()->bridge.action(answer(bridge,"draw-1")));
                if(!bridge.answer.equals(draw))throw new AssertionError("Draw answer changed");checks++;
                bridge.answer=null;bridge.pending=null;
                for(boolean wrapped:List.of(false,true)){
                    Object first=new String("same label"),second=new String("same label");
                    Object[] arguments=wrapped?new Object[]{"Order effects","Resolve first",0,0,List.of(first,second),null,null,false,true}:new Object[]{"Order effects","Resolve first",List.of(first,second),null};
                    CompletableFuture<Object> result=CompletableFuture.supplyAsync(()->{try{return bridge.choice("order",arguments);}catch(Exception e){throw new CompletionException(e);}});
                    long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
                    while(true){synchronized(bridge){if(bridge.pending!=null)break;}if(System.nanoTime()>deadline)throw new AssertionError("Order choice not published");Thread.yield();}
                    synchronized(bridge){bridge.action(answer(bridge,String.valueOf(bridge.pending.get("id")),1,0));}
                    Object value=result.get(3,TimeUnit.SECONDS);
                    List<?> ordered=wrapped?((forge.gui.interfaces.IGuiGame.OrderResult<?>)value).ordered():(List<?>)value;
                    if(ordered.get(0)!=second||ordered.get(1)!=first)throw new AssertionError("Choice identity/order was lost behind identical labels");checks++;
                }
                bridge.pending=ForgeProbe.obj("id","http-draw","mode","draw","min",0,"max",0,"options",List.of());
                JsonObject httpDraw=answer(bridge,"http-draw");
                HttpClient client=HttpClient.newHttpClient();URI endpoint=URI.create("http://127.0.0.1:"+bridge.server.getAddress().getPort()+"/action");
                HttpRequest wire=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(3)).header("X-CrankMagic-Bridge",bridge.token).POST(HttpRequest.BodyPublishers.ofString(httpDraw.toString())).build();
                HttpResponse<String> response=client.send(wire,HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()!=200||!bridge.answer.equals(httpDraw))throw new AssertionError("HTTP serialization changed the answer");checks++;
                long applied=bridge.revision;
                if(client.send(wire,HttpResponse.BodyHandlers.ofString()).statusCode()!=200||bridge.revision!=applied)throw new AssertionError("HTTP retry applied twice");checks++;
                HttpRequest unauthenticated=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(3)).POST(HttpRequest.BodyPublishers.ofString(httpDraw.toString())).build();
                if(client.send(unauthenticated,HttpResponse.BodyHandlers.ofString()).statusCode()==200||bridge.revision!=applied)throw new AssertionError("Unauthenticated HTTP action was accepted");checks++;

                Map<String,Object> amountDecision=ForgeProbe.obj("total",3,"minEach",0,"options",List.of(ForgeProbe.obj("max",2),ForgeProbe.obj("max",3)));
                JsonObject badAmount=new JsonObject();badAmount.add("amounts",ForgeProbe.JSON.toJsonTree(List.of(2,2)));rejected(()->ForgeBrowserBridge.validateGenericAmount(amountDecision,badAmount));
                JsonObject cappedAmount=new JsonObject();cappedAmount.add("amounts",ForgeProbe.JSON.toJsonTree(List.of(3,0)));rejected(()->ForgeBrowserBridge.validateGenericAmount(amountDecision,cappedAmount));
                JsonObject exactAmount=new JsonObject();exactAmount.add("amounts",ForgeProbe.JSON.toJsonTree(List.of(1,2)));ForgeBrowserBridge.validateGenericAmount(amountDecision,exactAmount);checks++;

                List<Map<String,Object>> orderOptions=List.of(ForgeProbe.obj("index",0,"label","movable","movable",true),ForgeProbe.obj("index",1,"label","fixed one","movable",false),ForgeProbe.obj("index",2,"label","fixed two","movable",false));
                bridge.answer=null;bridge.pending=ForgeProbe.obj("id","move-1","mode","order","min",3,"max",3,"choiceKind","manipulate","toTop",true,"toBottom",false,"toAnywhere",false,"options",orderOptions);
                rejected(()->bridge.action(answer(bridge,"move-1",1,0,2)));
                rejected(()->bridge.action(answer(bridge,"move-1",0,2,1)));
                JsonObject validMove=answer(bridge,"move-1",0,1,2);bridge.action(validMove);if(!bridge.answer.equals(validMove))throw new AssertionError("Validated card order changed in transit");checks++;

                bridge.answer=null;bridge.pending=ForgeProbe.obj("id","text-1","mode","text","min",0,"max",0,"numeric",true,"options",List.of());
                JsonObject invalidText=answer(bridge,"text-1");invalidText.addProperty("text","not a number");rejected(()->bridge.action(invalidText));
                JsonObject validText=answer(bridge,"text-1");validText.addProperty("text","12");bridge.action(validText);if(!bridge.answer.equals(validText))throw new AssertionError("Text answer changed in transit");checks++;
            } finally { bridge.server.stop(0); }
        }
        System.out.println(checks+" browser–Forge protocol checks passed; isolated artifacts: "+directory);
    }
}
