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
            } finally { bridge.server.stop(0); }
        }
        System.out.println(checks+" browser–Forge protocol checks passed; isolated artifacts: "+directory);
    }
}
