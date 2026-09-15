package crankmagic;
import com.google.gson.*;
import java.util.*;
/** Focused contract checks against the same validator used by live browser answers. */
public final class CombatAssignmentCheck {
  static Map<String,Object> decision(boolean override,boolean divide){
    return ForgeProbe.obj("total",7,"overrideOrder",override,"divide",divide,"maySkip",false,"options",List.of(
      ForgeProbe.obj("lethal",2,"defender",false),ForgeProbe.obj("lethal",3,"defender",false),ForgeProbe.obj("lethal",0,"defender",true)));
  }
  static void check(String json,boolean valid,boolean override,boolean divide){
    boolean accepted=true;try{ForgeBrowserBridge.validateCombatDamage(decision(override,divide),JsonParser.parseString(json).getAsJsonObject());}catch(IllegalArgumentException e){accepted=false;}
    if(accepted!=valid)throw new AssertionError(json+" accepted="+accepted);
  }
  public static void main(String[] args){
    check("{amounts:[2,3,2]}",true,false,false);
    check("{amounts:[0,0,7]}",false,false,false);
    check("{amounts:[2,2,3]}",false,true,false);
    check("{amounts:[1,6,0]}",true,true,false);
    check("{amounts:[1,6,0]}",false,false,false);
    check("{amounts:[0,0,7]}",true,true,true);
    check("{amounts:[2,3,1]}",false,true,false);
    check("{amounts:[2,3,2.5]}",false,true,false);
    check("{amounts:[-1,3,5]}",false,true,false);
    check("{skip:true}",false,true,false);
    System.out.println("10 combat assignment contract checks passed");
  }
}
