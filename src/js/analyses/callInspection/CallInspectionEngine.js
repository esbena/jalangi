/*jslint plusplus: false, bitwise: true, eqeq: true, unparam: true, white: false, browser: true, onevar: false */
/*global console: true, window: true, chrome: true, $: true, require: true, exports: true, process: true, module: true*/
(function(module){
    function CallInspectionEngine(executionIndex) {

        if (!(this instanceof CallInspectionEngine)) {
            return new CallInspectionEngine(executionIndex);
        } 

        var getIIDInfo = require('./../../utils/IIDInfo');
        this.Fe = function(iid, val, dis, args){
            console.log("<Fe> %s<%s>@%s(%s)", getIIDInfo(iid), val.name, dis, Array.prototype.slice.call(args, 0));
        };
        return undefined; // already initialized..
    }
    module.exports = CallInspectionEngine;
}(module));
