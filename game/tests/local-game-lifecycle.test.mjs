import test from 'node:test';
import assert from 'node:assert/strict';
import {childIsRunning,bridgeConnectionPath} from '../tools/local-game-launcher.mjs';
test('signal-terminated engines allow a fresh game even with null exitCode',()=>{
 assert.equal(childIsRunning({exitCode:null,signalCode:null}),true);
 assert.equal(childIsRunning({exitCode:null,signalCode:'SIGTERM'}),false);
 assert.equal(childIsRunning({exitCode:0,signalCode:null}),false);
 assert.equal(childIsRunning(null),false);
});
test('each browser seat resolves to a distinct host-private bridge file',()=>{
 assert.match(bridgeConnectionPath('C:/match',0).replaceAll('\\','/'),/\/match\/browser-bridge\.json$/);
 assert.match(bridgeConnectionPath('C:/match',2).replaceAll('\\','/'),/\/match\/seats\/2\/browser-bridge\.json$/);
 assert.throws(()=>bridgeConnectionPath('C:/match',4),/Invalid seat/);
});
