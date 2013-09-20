/*jslint plusplus: false, bitwise: true, eqeq: true, unparam: true, white: false, browser: true, onevar: false */
/*global console: true, window: true, chrome: true, $: true, require: true, exports: true, process: true, module: true*/
(function(module){
    function AssertionCheckerEngine(executionIndex) {

        if (!(this instanceof AssertionCheckerEngine)) {
            return new AssertionCheckerEngine(executionIndex);
        } 

        // Jalangi style argument passing. 
        // A map of system independent assertions about different source locations
        // Use `export JALANGI_ACE_PLUGIN=/home/drx/foo/bar/assertions/xyz.js`
        var pluginFile = process.env.JALANGI_ACE_PLUGIN; 
        var plugin = require(pluginFile);
        
        var getIIDInfo = require('./../../utils/IIDInfo');
        function getLocation(iid){
            var info = getIIDInfo(iid);
            var location = info.replace(/^\((.*)\)$/, "$1");
            return location;
        }

        var callLocations = [];

        this.Fe = function(iid, val, dis, args){
            plugin.functionEntry(getLocation(iid), dis, args, callLocations);
        };

        this.invokeFunPre = function(iid, f, base, args, isConstructor){
            callLocations.push(""); // start call
        };

        this.invokeFun = function(iid, f, base, args, val, isConstructor){
            callLocations.pop(); // end call
            return val;
        };

        this.endExecution = function(){
            plugin.endExecution();
        };

        return undefined; // already initialized..
    }
    module.exports = AssertionCheckerEngine;
}(module));
