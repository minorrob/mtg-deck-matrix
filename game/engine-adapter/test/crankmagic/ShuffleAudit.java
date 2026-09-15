package crankmagic;
import java.util.*;
/** Checks the recording RNG does not alter Java shuffle behavior or reset between shuffles. */
public final class ShuffleAudit {
  public static void main(String[] args) {
    var recorded=new ForgeProbe.TapeRandom(17291L,null);
    var ordinary=new Random(17291L);
    var expected=new ArrayList<Integer>();for(int i=0;i<99;i++)expected.add(i);
    var actual=new ArrayList<>(expected);List<Integer> previous=List.copyOf(actual);
    for(int shuffle=0;shuffle<100;shuffle++){
      Collections.shuffle(expected,ordinary);Collections.shuffle(actual,recorded);
      if(!actual.equals(expected))throw new AssertionError("Recording changed the shuffle");
      if(actual.equals(previous))throw new AssertionError("Shuffle repeated the previous order");
      if(new HashSet<>(actual).size()!=99)throw new AssertionError("Cards lost or duplicated");
      previous=List.copyOf(actual);
    }
    System.out.println("ShuffleAudit: 100 successive 99-card shuffles match Java Random, preserve every card and produce new orders.");
  }
}
