/*jslint plusplus: false, bitwise: true, eqeq: true, unparam: true, white: false, browser: true, onevar: false */
/*global console: true, window: true, chrome: true, $: true, require: true, exports: true, process: true, module: true*/

(function(module){
    function StringHistoryTrackingEngine(executionIndex) {
        if (!(this instanceof StringHistoryTrackingEngine)) {
            return new StringHistoryTrackingEngine(executionIndex);
        } 
        var ConcolicValue = require('./../../ConcolicValue');
        var getIIDInfo = require('./../../utils/IIDInfo');

        var getConcrete = this.getConcrete = ConcolicValue.getConcrete;
        var getSymbolic = this.getSymbolic = ConcolicValue.getSymbolic;

        var accesses = [];

        function ACCESS(type, iid, value){
            this.type = type;
            this.iid = iid;
            this.value = value;
        }
        ACCESS.prototype.toString = function(){
            var str;
            var sym = getSymbolic(this.value);
            if(sym){
                str = sym.toString();
            }else{
                str = "OTHER(" + this.value + ")";
            }
            return this.type + "(" + str + ")@" + getIIDInfo(this.iid);
        };

        function VAL(type, iid, value){
            this.type = type;
            this.iid = iid;
            this.value = value;
        }
        VAL.prototype.toString = function(){
            return this.type + "(" + this.value + ")";
        };

        function makeLiteral(iid, value){
            return new VAL("LIT", iid, value);
        }
        function renderSymbolic(v){
            var symbolic = getSymbolic(v);
            return symbolic? symbolic: "?(" + v + ")";
        }
        function renderSymbolicArrayEntries(a){
            var renderedArrayEntries = [];
            for(var i = 0; i < a.length; i++){
                renderedArrayEntries.push(renderSymbolic(a[i]));
            }
            return renderedArrayEntries + "";
        }
        function makeFunctionCall(iid, stringFunction, base, args, value){
            var str;
            if(stringFunction === undefined){
                str = "? ," + renderSymbolic(value);
            }else{
                str = renderSymbolic(base) + "." + stringFunction +  "(" + renderSymbolicArrayEntries(args) + "), " + value;
            }

            return new VAL("FUN", iid, str);
        }

        function makeConcat(iid, left, right, value){
            return new VAL("+", iid, renderSymbolic(left) + ", " + renderSymbolic(right) + ", " + value);
        }

        function registerAccess(type, iid, value){
            if(value instanceof ConcolicValue){
                accesses.push(new ACCESS(type, iid, value));
            }
        }

        this.literal = function(iid, val) {
            if (typeof val === "string") {
                return new ConcolicValue(val, makeLiteral(iid, val));
            }
            return val;
        };
        
        this.binary = function(iid, op, left, right, result_c){
            if(op === "+"){
                if(typeof result_c === "string"){
                    return new ConcolicValue(result_c, makeConcat(iid, left, right, result_c));
                }
            }
            return result_c;
        };

        this.invokeFun = function(iid, f, base, args, val, isConstructor){
            if(typeof val === "string" || val instanceof ConcolicValue){
                var stringFunction;
                if(f === String.prototype.indexOf){
                    stringFunction = "indexOf"; // returns DPA-uninteresting integer ...
                }else if(f === String.prototype.substring){
                    stringFunction = "substring";
                }else{
                    stringFunction = undefined;
                }
                return new ConcolicValue(val, makeFunctionCall(iid, stringFunction, base, args, val));
            }
            return val;
        };

        this.getFieldPre = function(iid, base, offset) {
            registerAccess("READ", iid, offset);
        };

        this.putFieldPre = function(iid, base, offset, val) {
            registerAccess("WRITE", iid, offset);
        };

        this.endExecution = function(){
            console.log("PROPERTY ACCESSES:");
            for(var access in accesses){
                if(accesses.hasOwnProperty(access)){
                    console.log(accesses[access].toString());
                }
            }
        };

        return undefined; // already initialized..
    }
    module.exports = StringHistoryTrackingEngine;
}(module));
