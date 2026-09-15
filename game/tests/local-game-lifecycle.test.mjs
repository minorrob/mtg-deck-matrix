import test from 'node:test';
import assert from 'node:assert/strict';
import {childIsRunning} from '../tools/local-game-launcher.mjs';
test('signal-terminated engines allow a fresh game even with null exitCode',()=>{
 assert.equal(childIsRunning({exitCode:null,signalCode:null}),true);
 assert.equal(childIsRunning({exitCode:null,signalCode:'SIGTERM'}),false);
 assert.equal(childIsRunning({exitCode:0,signalCode:null}),false);
 assert.equal(childIsRunning(null),false);
});
