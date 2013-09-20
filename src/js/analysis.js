/*
 * Copyright 2013 Samsung Information Systems America, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Author: Koushik Sen

J$ = {};

(function(sandbox) {
    if (typeof process !== 'undefined' && process.env.JALANGI_MODE === 'symbolic') {
        var single = require('./'+process.env.JALANGI_ANALYSIS);

        sandbox.U = single.U; // Unary operation
        sandbox.B = single.B; // Binary operation
        sandbox.C = single.C; // Condition
        sandbox.C1 = single.C1; // Switch key
        sandbox.C2 = single.C2; // case label C1 === C2
        sandbox._ = single._;  // Last value passed to C

        sandbox.H = single.H; // hash in for-in
        sandbox.I = single.I; // Ignore argument
        sandbox.G = single.G; // getField
        sandbox.P = single.P; // putField
        sandbox.R = single.R; // Read
        sandbox.W = single.W; // Write
        sandbox.N = single.N; // Init
        sandbox.T = single.T; // object/function/regexp/array Literal
        sandbox.F = single.F; // Function call
        sandbox.M = single.M; // Method call
        sandbox.A = single.A; // Modify and assign +=, -= ...
        sandbox.Fe = single.Fe; // Function enter
        sandbox.Fr = single.Fr; // Function return
        sandbox.Se = single.Se; // Script enter
        sandbox.Sr = single.Sr; // Script return
        sandbox.Rt = single.Rt; // Value return
        sandbox.Ra = single.Ra;

        sandbox.makeSymbolic = single.makeSymbolic;
        sandbox.addAxiom = single.addAxiom;
        sandbox.endExecution = single.endExecution;
    } else {

//------------------------------- Stats for the paper -----------------------
        var skippedReads = 0;
        var skippedGetFields = 0;
        var unoptimizedLogs = 0;
        var optimizedLogs = 0;

//-------------------------------- Constants ---------------------------------

        var EVAL_ORG = eval;

        var PREFIX1 = "J$";
        var SPECIAL_PROP = "*"+PREFIX1+"*";
        var SPECIAL_PROP2 = "*"+PREFIX1+"I*";
        var SPECIAL_PROP3 = "*"+PREFIX1+"C*";
        var DEBUG = false;
        var WARN = false;
        var SERIOUS_WARN = false;
        var MAX_BUF_SIZE = 4096;
        var TRACE_FILE_NAME = 'jalangi_trace';

        var T_NULL = 0,
            T_NUMBER = 1,
            T_BOOLEAN = 2,
            T_STRING = 3,
            T_OBJECT = 4,
            T_FUNCTION = 5,
            T_UNDEFINED = 6,
            T_ARRAY = 7;

        var F_TYPE = 0,
            F_VALUE = 1,
            F_IID = 2,
            F_FUNNAME = 4,
            F_SEQ = 3;

//    var N_LOG_LOAD = 0,
//    var N_LOG_FUN_CALL = 1,
//      N_LOG_METHOD_CALL = 2,
        var  N_LOG_FUNCTION_ENTER = 4,
//      N_LOG_FUNCTION_RETURN = 5,
            N_LOG_SCRIPT_ENTER = 6,
//      N_LOG_SCRIPT_EXIT = 7,
            N_LOG_GETFIELD = 8,
//      N_LOG_GLOBAL = 9,
            N_LOG_ARRAY_LIT = 10,
            N_LOG_OBJECT_LIT = 11,
            N_LOG_FUNCTION_LIT = 12,
            N_LOG_RETURN = 13,
            N_LOG_REGEXP_LIT = 14,
//      N_LOG_LOCAL = 15,
//      N_LOG_OBJECT_NEW = 16,
            N_LOG_READ = 17,
//      N_LOG_FUNCTION_ENTER_NORMAL = 18,
            N_LOG_HASH = 19,
            N_LOG_SPECIAL = 20,
            N_LOG_STRING_LIT = 21,
            N_LOG_NUMBER_LIT = 22,
            N_LOG_BOOLEAN_LIT = 23,
            N_LOG_UNDEFINED_LIT = 24,
            N_LOG_NULL_LIT = 25;

        var MODE_RECORD = 1,
            MODE_REPLAY = 2,
            MODE_NO_RR_IGNORE_UNINSTRUMENTED = 3,
            MODE_NO_RR = 4;

        //-------------------------------- End constants ---------------------------------


        var mode = (function(str) {
            switch(str) {
                case "record" :
                    return MODE_RECORD;
                case "replay":
                    return MODE_REPLAY;
                case "analysis":
                    return MODE_NO_RR_IGNORE_UNINSTRUMENTED;
                case "concrete":
                    return MODE_NO_RR;
                default:
                    return MODE_RECORD;
            }
        }((typeof window === "undefined")?process.env.JALANGI_MODE:window.JALANGI_MODE));
        var ANALYSIS = ((typeof window === "undefined")?process.env.JALANGI_ANALYSIS:window.JALANGI_ANALYSIS);
        var isBrowserReplay = (typeof window !== 'undefined') && mode ===MODE_REPLAY;

        var executionIndex = new ExecutionIndex();

        var sEngine;
        var branchCoverageInfo;// = require('./BranchCoverageInfo');
        if (ANALYSIS && ANALYSIS.indexOf("Engine")>=0) {
//        var getSymbolicFunctionToInvoke = require('./SymbolicFunctions');
            var SymbolicEngine = require('./'+ANALYSIS);
            sEngine = new SymbolicEngine(executionIndex);
        }


        var rrEngine;
        if (mode=== MODE_RECORD || mode === MODE_REPLAY) {
            rrEngine = new RecordReplayEngine();
        }


        var log = (function(){
            var list;

            return {
                reset: function() {
                    list = [];
                },

                log: function(str) {
                    if (list)
                        list.push(str);
                },

                getLog: function() {
                    return list;
                }
            }
        })();


        //-------------------------------------- Symbolic functions -----------------------------------------------------------

        function create_fun(f) {
            return function() {
                var len = arguments.length;
                for (var i = 0; i<len; i++) {
                    arguments[i] = J$.getConcrete(arguments[i]);
                }
                return f.apply(J$.getConcrete(this),arguments);
            }
        }

        function getSymbolicFunctionToInvokeAndLog (f, isConstructor) {
            if (f === Array ||
                f === Error ||
                f === String ||
                f === Number ||
                f === Boolean ||
                f === RegExp ||
                f === J$.addAxiom ||
                f === J$.readInput) {
                return [f, true];
            } else if (f === Function.prototype.apply ||
                f === Function.prototype.call ||
                f === console.log ||
                f === RegExp.prototype.test ||
                f === String.prototype.indexOf ||
                f === String.prototype.lastIndexOf ||
                f === String.prototype.substring ||
                f === String.prototype.substr ||
                f === String.prototype.charCodeAt ||
                f === String.prototype.charAt ||
                f === String.prototype.replace ||
                f === String.fromCharCode ||
                f === Math.abs ||
                f === Math.acos ||
                f === Math.asin ||
                f === Math.atan ||
                f === Math.atan2 ||
                f === Math.ceil ||
                f === Math.cos ||
                f === Math.exp ||
                f === Math.floor ||
                f === Math.log ||
                f === Math.max ||
                f === Math.min ||
                f === Math.pow ||
                f === Math.round ||
                f === Math.sin ||
                f === Math.sqrt ||
                f === Math.tan ||
                f === parseInt) {
                return  [create_fun(f), false];
            }
            return [null, true];
        }

        function isReturnLogNotRequired(f) {
            if (f === console.log ||
                f === RegExp.prototype.test ||
                f === String.prototype.indexOf ||
                f === String.prototype.lastIndexOf ||
                f === String.prototype.substring ||
                f === Math.abs ||
                f === Math.acos ||
                f === Math.asin ||
                f === Math.atan ||
                f === Math.atan2 ||
                f === Math.ceil ||
                f === Math.cos ||
                f === Math.exp ||
                f === Math.floor ||
                f === Math.log ||
                f === Math.max ||
                f === Math.min ||
                f === Math.pow ||
                f === Math.round ||
                f === Math.sin ||
                f === Math.sqrt ||
                f === Math.tan ||
                f === String.prototype.charCodeAt ||
                f === parseInt
                ) {
                return true;
            }
            return false;
        }

        //---------------------------- Utility functions -------------------------------
        function getConcrete(val) {
            if (sEngine && sEngine.getConcrete) {
                return sEngine.getConcrete(val);
            } else {
                return val;
            }
        }

        function getSymbolic(val) {
            if (sEngine && sEngine.getSymbolic) {
                return sEngine.getSymbolic(val);
            } else {
                return val;
            }
        }

        function addAxiom(c) {
            if (sEngine && sEngine.installAxiom) {
                sEngine.installAxiom(c);
            }
        }

        function HOP(obj, prop) {
            return Object.prototype.hasOwnProperty.call(obj, prop);
        };



        function debugPrint(s) {
            if (DEBUG) {
                console.log("***" + s);
            }
        }

        function warnPrint(iid, s) {
            if (WARN && iid !== 0) {
                console.log("        at " + iid + " " + s);
            }
        }

        function seriousWarnPrint(iid, s) {
            if (SERIOUS_WARN && iid !== 0) {
                console.log("        at " + iid + " Serious " + s);
            }
        }

        function slice(a, start) {
            return Array.prototype.slice.call(a, start || 0);
        }

        function isNative(f) {
            return f.toString().indexOf('[native code]') > -1 || f.toString().indexOf('[object ') === 0;
        }


        function printValueForTesting(loc, iid, val) {
            return;
            var type = typeof val;
            if (type !== 'object' && type !== 'function') {
                console.log(loc+":"+iid+":"+type+":"+val);
            }
            if (val===null) {
                console.log(loc+":"+iid+":"+type+":"+val);
            }
        }
        //---------------------------- End utility functions -------------------------------


        //-------------------------------- Execution indexing --------------------------------
        function ExecutionIndex() {
            var counters = {};
            var countersStack = [counters];

            function executionIndexCall() {
                counters = {};
                countersStack.push(counters);
            }

            function executionIndexReturn() {
                countersStack.pop();
                counters = countersStack[countersStack.length-1];
            }

            function executionIndexInc(iid) {
                var c = counters[iid];
                if (c===undefined) {
                    c = 1;
                } else {
                    c++;
                }
                counters[iid] = c;
                counters.iid = iid;
                counters.count = c;
            }

            function executionIndexGetIndex() {
                var i, ret = [];
                var iid;
                for (i= countersStack.length-1; i >=0; i-- ) {
                    iid = countersStack[i].iid;
                    if (iid !== undefined) {
                        ret.push(iid);
                        ret.push(countersStack[i].count);
                    }
                }
                return (ret+"").replace(/,/g,"_");
            }

            if (this instanceof ExecutionIndex) {
                this.executionIndexCall = executionIndexCall;
                this.executionIndexReturn = executionIndexReturn;
                this.executionIndexInc = executionIndexInc;
                this.executionIndexGetIndex = executionIndexGetIndex;
            } else {
                return new ExecutionIndex();
            }
        }
        //-------------------------------- End Execution indexing --------------------------------

        //----------------------------------- Begin concolic execution ---------------------------------

        function callAsNativeConstructorWithEval(Constructor, args) {
            var a = [];
            for (var i = 0; i < args.length; i++)
                a[i] = 'args[' + i + ']';
            var eval = EVAL_ORG;
            return eval('new Constructor(' + a.join() + ')');
        }

        function callAsNativeConstructor (Constructor, args) {
            if (args.length === 0) {
                return new Constructor();
            }
            if (args.length === 1) {
                return new Constructor(args[0]);
            }
            if (args.length === 2) {
                return new Constructor(args[0], args[1]);
            }
            if (args.length === 3) {
                return new Constructor(args[0], args[1], args[2]);
            }
            if (args.length === 4) {
                return new Constructor(args[0], args[1], args[2], args[3]);
            }
            if (args.length === 5) {
                return new Constructor(args[0], args[1], args[2], args[3], args[4]);
            }
            return callAsNativeConstructorWithEval(Constructor, args);
        }

        function callAsConstructor(Constructor, args) {
            if (isNative(Constructor)) {
                return callAsNativeConstructor(Constructor,args);
            } else {
                var Temp = function(){}, inst, ret;
                Temp.prototype = Constructor.prototype;
                inst = new Temp;
                ret = Constructor.apply(inst, args);
                return Object(ret) === ret ? ret : inst;
            }
        }


        function invokeEval(base, f, args) {
            if (rrEngine) {
                rrEngine.RR_evalBegin();
            }
            try {
                return f.call(base,sandbox.instrumentCode(args[0],true));
            } finally {
                if (rrEngine) {
                    rrEngine.RR_evalEnd();
                }
            }
        }

        var isInstrumentedCaller = false;

        function invokeFun(iid, base, f, args, isConstructor) {
            var g, invoke, val, ic, tmp_rrEngine;

            var f_c = getConcrete(f);

            if (sEngine && sEngine.invokeFunPre) {
                tmp_rrEngine = rrEngine;
                rrEngine = null;
                sEngine.invokeFunPre(iid, f, base, args, isConstructor);
                rrEngine = tmp_rrEngine;
            }

            executionIndex.executionIndexInc(iid);

            var arr = getSymbolicFunctionToInvokeAndLog(f_c, isConstructor);
            ic = isInstrumentedCaller = f_c === undefined || HOP(f_c,SPECIAL_PROP2) || typeof f_c !== "function";

            if (mode === MODE_RECORD || mode === MODE_NO_RR) {
                invoke = true;
                g = f_c;
            } else if (mode === MODE_REPLAY || mode === MODE_NO_RR_IGNORE_UNINSTRUMENTED) {
                invoke = arr[0] || isInstrumentedCaller;
                g = arr[0] || f_c ;
            }

            pushSwitchKey();
            try {
                if (g === EVAL_ORG){
                    val = invokeEval(base, g, args);
                } else if (invoke) {
                    if (isConstructor) {
                        val = callAsConstructor(g, args);
                    } else {
                        val = g.apply(base, args);
                    }
                }  else {
                    if (rrEngine) {
                        rrEngine.RR_replay();
                    }
                    val = undefined;
                }
            } finally {
                popSwitchKey();
                isInstrumentedCaller = false;
            }

            if (!ic && arr[1]) {
                if (rrEngine) {
                    val = rrEngine.RR_L(iid, val, N_LOG_RETURN);
                }
            }
            if (sEngine && sEngine.invokeFun) {
                tmp_rrEngine = rrEngine;
                rrEngine = null;
                val = sEngine.invokeFun(iid, f, base, args, val, isConstructor);
                rrEngine = tmp_rrEngine;
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(val);
                }
            }
            printValueForTesting(2, iid,val);
            return val;
        }

        //var globalInstrumentationInfo;

        function F(iid, f, isConstructor) {
            return function() {
                var base = this;
                return invokeFun(iid, base, f, arguments, isConstructor);
            }
        }

        function M(iid, base, offset, isConstructor) {
            return function() {
                var f = G(iid, base, offset);
                return invokeFun(iid, base, f, arguments, isConstructor);
            };
        }

        function Fe(iid, val, dis, args) {
            executionIndex.executionIndexCall();
            if (rrEngine) {
                rrEngine.RR_Fe(iid, val, dis);
            }
            if (sEngine && sEngine.Fe) {
                sEngine.Fe(iid, val, dis, args);
            }

            returnVal = undefined;
        }

        function Fr(iid) {
            executionIndex.executionIndexReturn();
            if (rrEngine) {
                rrEngine.RR_Fr(iid);
            }
        }

        var returnVal;

        function Rt(iid, val) {
            return returnVal = val;
        }

        function Ra() {
            var ret = returnVal;
            returnVal = undefined;
            return ret;
        }

        var scriptCount = 0;

        function Se(iid,val) {
            scriptCount++;
            if (rrEngine) {
                rrEngine.RR_Se(iid,val);
            }
        }

        function Sr(iid) {
            scriptCount--;
            if (rrEngine) {
                rrEngine.RR_Sr(iid);
            }
            if (mode === MODE_NO_RR_IGNORE_UNINSTRUMENTED && scriptCount === 0) {
                endExecution();
            }
        }

        function I(val) {
            return val;
        }

        function T(iid, val, type) {
            if (sEngine && sEngine.literalPre) {
                sEngine.literalPre(iid, val);
            }
            if (rrEngine) {
                rrEngine.RR_T(iid, val, type);
            }
            if (type === N_LOG_FUNCTION_LIT) {
                val[SPECIAL_PROP2] = true;
            }

            if (sEngine && sEngine.literal) {
                val = sEngine.literal(iid, val);
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(val);
                }
            }

            return val;
        }

        function H(iid, val) {
            if (rrEngine) {
                val = rrEngine.RR_H(iid,val);
            }
            return val;
        }


        function R(iid, name, val) {
            if (sEngine && sEngine.readPre) {
                sEngine.readPre(iid, name, val);
            }
            if (rrEngine) {
                val = rrEngine.RR_R(iid, name, val);
            }
            if (sEngine && sEngine.read) {
                val = sEngine.read(iid, name, val);
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(val);
                }
            }
            printValueForTesting(3, iid, val);
            return val;
        }

        function W(iid, name, val, lhs) {
            if (sEngine && sEngine.writePre) {
                sEngine.writePre(iid, name, val);
            }
            if (rrEngine) {
                rrEngine.RR_W(iid, name, val);
            }
            if (sEngine && sEngine.write) {
                sEngine.write(iid, name, val);
            }
            return val;
        }

        function N(iid, name, val, isArgumentSync) {
            if (rrEngine) {
                rrEngine.RR_N(iid, name, val, isArgumentSync);
            }
            return val;
        }


        function A(iid,base,offset,op) {
            var oprnd1 = G(iid,base, offset);
            return function(oprnd2) {
                var val = B(iid, op, oprnd1, oprnd2);
                return P(iid, base, offset, val);
            };
        }

        function G(iid, base, offset, norr) {
            if (offset===SPECIAL_PROP || offset === SPECIAL_PROP2 || offset === SPECIAL_PROP3) {
                return undefined;
            }

            var base_c = getConcrete(base);
            if (sEngine && sEngine.getFieldPre) {
                sEngine.getFieldPre(iid, base, offset);
            }
            var val = base_c[getConcrete(offset)];


            if (rrEngine && !norr) {
                val = rrEngine.RR_G(iid, base, offset, val);
            }
            if (sEngine && sEngine.getField) {
                var tmp_rrEngine = rrEngine;
                rrEngine = null;
                val = sEngine.getField(iid, base, offset, val);
                rrEngine = tmp_rrEngine;
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(val);
                }
            }
            printValueForTesting(1, iid,val);
            return val;
        }

        function P(iid, base, offset, val) {
            if (offset===SPECIAL_PROP || offset === SPECIAL_PROP2 || offset === SPECIAL_PROP3) {
                return undefined;
            }

            var base_c = getConcrete(base);
            if (sEngine && sEngine.putFieldPre) {
                sEngine.putFieldPre(iid, base, offset, val);
            }

            base_c[getConcrete(offset)] = val;

            if (rrEngine) {
                rrEngine.RR_P(iid, base, offset, val);
            }
            if (sEngine && sEngine.putField) {
                sEngine.putField(iid, base, offset, val);
            }

            return val;
        }

        function B(iid, op, left, right) {
            var left_c, right_c, result_c;

            if (sEngine && sEngine.binaryPre) {
                sEngine.binaryPre(iid, op, left, right);
            }

            left_c = getConcrete(left);
            right_c = getConcrete(right);

            switch(op) {
                case "+":
                    result_c = left_c + right_c;
                    break;
                case "-":
                    result_c = left_c - right_c;
                    break;
                case "*":
                    result_c = left_c * right_c;
                    break;
                case "/":
                    result_c = left_c / right_c;
                    break;
                case "%":
                    result_c = left_c % right_c;
                    break;
                case "<<":
                    result_c = left_c << right_c;
                    break;
                case ">>":
                    result_c = left_c >> right_c;
                    break;
                case ">>>":
                    result_c = left_c >>> right_c;
                    break;
                case "<":
                    result_c = left_c < right_c;
                    break;
                case ">":
                    result_c = left_c > right_c;
                    break;
                case "<=":
                    result_c = left_c <= right_c;
                    break;
                case ">=":
                    result_c = left_c >= right_c;
                    break;
                case "==":
                    result_c = left_c == right_c;
                    break;
                case "!=":
                    result_c = left_c != right_c;
                    break;
                case "===":
                    result_c = left_c === right_c;
                    break;
                case "!==":
                    result_c = left_c !== right_c;
                    break;
                case "&":
                    result_c = left_c & right_c;
                    break;
                case "|":
                    result_c = left_c | right_c;
                    break;
                case "^":
                    result_c = left_c ^ right_c;
                    break;
                case "instanceof":
                    result_c = left_c instanceof right_c;
                    break;
                case "in":
                    result_c = left_c in right_c;
                    if (rrEngine) {
                        result_c = rrEngine.RR_L(iid, result_c, N_LOG_RETURN);
                    }
                    break;
                case "&&":
                    result_c = left_c && right_c;
                    break;
                case "||":
                    result_c = left_c || right_c;
                    break;
                case "regexin":
                    result_c = right_c.test(left_c);
                    break;
                default:
                    throw new Error(op +" at "+iid+" not found");
                    break;
            }

            if (sEngine && sEngine.binary) {
                result_c = sEngine.binary(iid, op, left, right, result_c);
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(result_c);
                }
            }
            return result_c;
        }


        function U(iid, op, left) {
            var left_c, result_c;

            if (sEngine && sEngine.unaryPre) {
                sEngine.unaryPre(iid, op, left);
            }

            left_c = getConcrete(left);

            switch(op) {
                case "+":
                    result_c = + left_c;
                    break;
                case "-":
                    result_c = - left_c;
                    break;
                case "~":
                    result_c = ~ left_c;
                    break;
                case "!":
                    result_c = ! left_c;
                    break;
                case "typeof":
                    result_c = typeof left_c;
                    break;
                default:
                    throw new Error(op +" at "+iid+" not found");
                    break;
            }

            if (sEngine && sEngine.unary) {
                result_c = sEngine.unary(iid, op, left, result_c);
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(result_c);
                }
            }
            return result_c;
        }

        var lastVal;
        var switchLeft;
        var switchKeyStack = [];

        function pushSwitchKey() {
            switchKeyStack.push(switchLeft);
        }

        function popSwitchKey() {
            switchLeft = switchKeyStack.pop();
        }

        function last() {
            return lastVal;
        };

        function C1(iid, left) {
            var left_c;

            left_c = getConcrete(left);
            switchLeft = left;
            return left_c;
        };

        function C2(iid, left) {
            var left_c, ret;
            executionIndex.executionIndexInc(iid);

            left_c = getConcrete(left);
            left = B(iid, "===", switchLeft, left);

            if (sEngine && sEngine.conditionalPre) {
                sEngine.conditionalPre(iid, left);
            }

            ret = !!getConcrete(left);

            if (sEngine && sEngine.conditional) {
                sEngine.conditional(iid, left, ret);
            }

            if (branchCoverageInfo) {
                branchCoverageInfo.updateBranchInfo(iid, ret);
            }

            log.log("B"+iid+":"+(left_c?1:0));
            return left_c;
        };

        function C(iid, left) {
            var left_c, ret;
            executionIndex.executionIndexInc(iid);
            if (sEngine && sEngine.conditionalPre) {
                sEngine.conditionalPre(iid, left);
            }

            left_c = getConcrete(left);
            ret = !!left_c;

            if (sEngine && sEngine.conditional) {
                lastVal = sEngine.conditional(iid, left, ret);
                if (rrEngine) {
                    rrEngine.RR_updateRecordedObject(lastVal);
                }
            } else {
                lastVal = left_c;
            }

            if (branchCoverageInfo) {
                branchCoverageInfo.updateBranchInfo(iid, ret);
            }

            log.log("B"+iid+":"+(left_c?1:0));
            return left_c;
        }

//----------------------------------- End concolic execution ---------------------------------

//----------------------------------- Record Replay Engine ---------------------------------

        function RecordReplayEngine() {

            if (!(this instanceof RecordReplayEngine)) {
                return new RecordReplayEngine();
            }

            var traceInfo;
            var seqNo = 0;

            var frame = {};
            var frameStack = [frame];

            var evalFrames = [];

            var literalId = 2;
            var setLiteralId;
            var updateRecordedObject;

            /*
         type enumerations are
         null is 0
         number is 1
         boolean is 2
         string is 3
         object is 4
         function is 5
         undefined is 6
         array is 7
         */
            var objectId = 1;

            function printableValue(val) {
                var value, typen = getNumericType(val), ret = [];
                if (typen === T_NUMBER || typen === T_BOOLEAN || typen === T_STRING) {
                    value = val;
                } else if (typen === T_UNDEFINED) {
                    value = 0;
                } else {
                    if (val === null) {
                        value = 0;
                    } else {
                        if (!HOP(val, SPECIAL_PROP)) {
                            val[SPECIAL_PROP] = {};
                            val[SPECIAL_PROP][SPECIAL_PROP] = objectId;
                            objectId = objectId + 2;
                        }
                        if (HOP(val,SPECIAL_PROP) && typeof val[SPECIAL_PROP][SPECIAL_PROP] === 'number') {
                            value = val[SPECIAL_PROP][SPECIAL_PROP];
                        } else {
                            value = undefined;
                        }
                    }
                }
                ret[F_TYPE] = typen;
                ret[F_VALUE] = value;
                return ret;
            }

            function getNumericType(val) {
                var type = typeof val;
                var typen;
                switch(type) {
                    case "number":
                        typen = T_NUMBER;
                        break;
                    case "boolean":
                        typen = T_BOOLEAN;
                        break;
                    case "string":
                        typen = T_STRING;
                        break;
                    case "object":
                        if (val===null) {
                            typen = T_NULL;
                        } else if( Object.prototype.toString.call( val ) === '[object Array]' ) {
                            typen = T_ARRAY;
                        } else {
                            typen = T_OBJECT;
                        }
                        break;
                    case "function":
                        typen = T_FUNCTION;
                        break;
                    case "undefined":
                        typen = T_UNDEFINED;
                        break;
                }
                return typen;
            }


            var syncValue = (function(){
                var objectMap = [];
                //var objectMapIndex = [];


                updateRecordedObject = function(obj) {
                    var val = getConcrete(obj);
                    if (val !== obj && val !== undefined && val !== null && HOP(val, SPECIAL_PROP)) {
                        var id = val[SPECIAL_PROP][SPECIAL_PROP];
                        objectMap[id] = obj;
                    }
                }

                setLiteralId = function(val) {
                    var id;
                    var oldVal = val;
                    val = getConcrete(oldVal);
                    if (!HOP(val,SPECIAL_PROP)) {
                        val[SPECIAL_PROP] = {};
                        val[SPECIAL_PROP][SPECIAL_PROP] = id = literalId;
                        literalId = literalId + 2;
                        for (var offset in val) {
                            if (offset !== SPECIAL_PROP && offset !== SPECIAL_PROP2 && HOP(val, offset)) {
                                val[SPECIAL_PROP][offset] = val[offset];
                            }
                        }
                    }
                    if (mode === MODE_REPLAY) {
                        objectMap[id] = oldVal;
                    }
                }

                function getActualValue(recordedValue, recordedType) {
                    if (recordedType === T_UNDEFINED) {
                        return undefined;
                    } else if (recordedType === T_NULL) {
                        return null;
                    } else {
                        return recordedValue;
                    }
                }

                return function(recordedArray, replayValue, iid) {
                    var oldReplayValue = replayValue, tmp;;
                    replayValue = getConcrete(replayValue);
                    var recordedValue = recordedArray[F_VALUE], recordedType = recordedArray[F_TYPE];

                    if (recordedType === T_UNDEFINED ||
                        recordedType === T_NULL ||
                        recordedType === T_NUMBER ||
                        recordedType === T_STRING ||
                        recordedType === T_BOOLEAN) {
                        if((tmp = getActualValue(recordedValue,recordedType)) !== replayValue) {
                            return tmp;
                        } else {
                            return oldReplayValue;
                        }
                    } else {
                        //var id = objectMapIndex[recordedValue];
                        var obj = objectMap[recordedValue];
                        var type = getNumericType(replayValue);

                        if (obj===undefined) {
                            if (type === recordedType && !HOP(replayValue,SPECIAL_PROP)) {
                                obj = replayValue;
                            } else {
                                if (recordedType === T_OBJECT) {
                                    obj = {};
                                } else if (recordedType === T_ARRAY){
                                    obj = [];
                                } else {
                                    obj = function(){};
                                }
                            }
                            obj[SPECIAL_PROP] = {};
                            obj[SPECIAL_PROP][SPECIAL_PROP] = recordedValue;
                            objectMap[recordedValue] = ((obj === replayValue)? oldReplayValue : obj);
                        }
                        return (obj === replayValue)? oldReplayValue : obj;
                    }
                }
            }());


            var logToFile, flush, remoteLog, onflush;

            (function(){
                var bufferSize = 0;
                var buffer = [];
                var traceWfh;
                var fs = (typeof window === "undefined")?require('fs'):undefined;

                function getFileHanlde() {
                    if (traceWfh === undefined) {
                        traceWfh = fs.openSync(process.argv[2]?process.argv[2]:TRACE_FILE_NAME, 'w');
                    }
                    return traceWfh;
                }

                logToFile = function(line) {
                    buffer.push(line);
                    bufferSize += line.length;
                    if (bufferSize > MAX_BUF_SIZE) {
                        flush();
                    }
                }

                flush = function() {
                    var msg;
                    if (typeof window === 'undefined') {
                        var length = buffer.length;
                        for (var i=0; i < length; i++) {
                            fs.writeSync(getFileHanlde(),buffer[i]);
                        }
                    } else {
                        msg = buffer.join('');
                        if (msg.length >1) {
                            remoteLog(msg);
                        }
                    }
                    bufferSize = 0;
                    buffer = [];
                }


                var trying = false;
                var cb;
                var remoteBuffer = [];
                var socket, isOpen = false;

                function openSocketIfNotOpen() {
                    if (!socket) {
                        console.log("Opening connection");
                        socket = new WebSocket('ws://127.0.0.1:8080', 'log-protocol');
                        socket.onopen = tryRemoteLog;
                        socket.onmessage = tryRemoteLog2;
                    }
                }

                function tryRemoteLog2() {
                    trying = false;
                    remoteBuffer.shift();
                    if (remoteBuffer.length === 0) {
                        if (cb) {
                            cb();
                            cb = undefined;
                        }
                    }
                    tryRemoteLog();
                }

                onflush = function(callback) {
                    if (remoteBuffer.length === 0) {
                        if (callback) {
                            callback();
                        }
                    } else {
                        cb = callback;
                        tryRemoteLog();
                    }
                }

                function tryRemoteLog() {
                    isOpen = true;
                    if (!trying && remoteBuffer.length > 0) {
                        trying = true;
                        socket.send(remoteBuffer[0]);
                    }
                }

                remoteLog = function(message) {
                    remoteBuffer.push(message);
                    openSocketIfNotOpen();
                    if (isOpen) {
                        tryRemoteLog();
                    }
                }
            }());

            this.onflush = onflush;

            function record(prefix) {
                var ret = [];
                ret[F_TYPE] = getNumericType(prefix);
                ret[F_VALUE] = prefix;
                logValue(0, ret, N_LOG_SPECIAL);
            };
            this.record = record;

            function command (rec) {
                remoteLog(rec);
            };
            this.command = command;

            function logValue(iid,ret,funName) {
                ret[F_IID] = iid;
                ret[F_FUNNAME] = funName;
                ret[F_SEQ] = seqNo++;
                var line = JSON.stringify(ret)+"\n";
                logToFile(line);
            }

            function checkPath(ret,iid) {
                if (ret === undefined || ret[F_IID] !== iid) {
                    seriousWarnPrint(iid, "Path deviation at record = ["+ret + "] iid = "+iid+ " index = " +traceInfo.getPreviousIndex());
                    throw new Error("Path deviation at record = ["+ret + "] iid = "+iid+ " index = " +traceInfo.getPreviousIndex());
                }
            }

            this.RR_updateRecordedObject = updateRecordedObject;

            this.RR_evalBegin = function() {
                evalFrames.push(frame);
                frame = frameStack[0];
            }

            this.RR_evalEnd = function() {
                frame = evalFrames.pop();
            }

            this.RR_G = function(iid, base, offset, val) {
                var base_c, type;

                offset = getConcrete(offset);
                if (mode === MODE_RECORD) {
                    base_c = getConcrete(base);
                    if ((type = typeof base_c) === 'string' ||
                        type === 'number' ||
                        type === 'boolean' ) {
                        seqNo++;
                        return val;
                    } else if (!HOP(base_c,SPECIAL_PROP)) {
                        return this.RR_L(iid, val, N_LOG_GETFIELD);
                    } else if (base_c[SPECIAL_PROP][offset] === val ||
                        (val !== val && base_c[SPECIAL_PROP][offset] !== base_c[SPECIAL_PROP][offset])) {
                        seqNo++;
                        return val;
                    } else {
                        base_c[SPECIAL_PROP][offset] = val;
                        return this.RR_L(iid, val, N_LOG_GETFIELD);
                    }
                } else if (mode === MODE_REPLAY) {
                    if (traceInfo.getCurrent() === undefined) {
                        traceInfo.next();
                        skippedGetFields++;
                        return val;
                    } else {
                        val = this.RR_L(iid, val, N_LOG_GETFIELD);
                        base_c = getConcrete(base);
                        base_c[offset] = val;
                        return val;
                    }
                } else {
                    return val;
                }
            }


            this.RR_P = function(iid, base, offset, val) {
                if (mode === MODE_RECORD) {
                    var base_c = getConcrete(base);
                    if (HOP(base_c,SPECIAL_PROP)) {
                        base_c[SPECIAL_PROP][getConcrete(offset)] = val;
                    }
                }
            }

            function getFrameContainingVar(name) {
                var tmp = frame;
                while(tmp && !HOP(tmp,name)) {
                    tmp = tmp[SPECIAL_PROP3];
                }
                if (tmp) {
                    return tmp;
                } else {
                    return frameStack[0]; // return global scope
                }
            }

            this.RR_W = function (iid, name, val) {
                if (mode === MODE_RECORD || mode === MODE_REPLAY) {
                    getFrameContainingVar(name)[name] = val;
                }
            }

            this.RR_N = function (iid, name, val, isArgumentSync) {
                if (mode === MODE_RECORD || mode === MODE_REPLAY) {
                    if (isArgumentSync === false || (isArgumentSync === true && isInstrumentedCaller)) {
                        frame[name] = val;
                    } else if (isArgumentSync === true && !isInstrumentedCaller) {
                        frame[name] = undefined;
                    }
                }
            }

            this.RR_R = function(iid, name, val) {
                var ret, trackedVal, trackedFrame;

                trackedFrame = getFrameContainingVar(name);
                trackedVal = trackedFrame[name];

                if (mode === MODE_RECORD) {
                    if (trackedVal === val || (val !== val && trackedVal !== trackedVal)) {
                        seqNo++;
                        ret = val;
                    } else {
                        trackedFrame[name] = val;
                        ret = this.RR_L(iid, val, N_LOG_READ);
                    }
                } else if (mode === MODE_REPLAY) {
                    if (traceInfo.getCurrent() === undefined) {
                        traceInfo.next();
                        skippedReads++;
                        ret = trackedVal;
                    } else {
                        ret = trackedFrame[name] = this.RR_L(iid, val, N_LOG_READ);
                    }
                } else {
                    ret = val;
                }
                return ret;
            }

            this.RR_Fe = function(iid, val, dis) {
                var ret;
                if (mode === MODE_RECORD || mode === MODE_REPLAY) {
                    frameStack.push(frame={});
                    frame[SPECIAL_PROP3] = val[SPECIAL_PROP3];
                    if (!isInstrumentedCaller) {
                        if (mode === MODE_RECORD) {
                            var tmp = printableValue(val);
                            logValue(iid,tmp,N_LOG_FUNCTION_ENTER);
                            tmp = printableValue(dis);
                            logValue(iid,tmp,N_LOG_FUNCTION_ENTER);
                        } else if (mode === MODE_REPLAY) {
                            ret = traceInfo.getAndNext();
                            checkPath(ret,iid);
                            ret = traceInfo.getAndNext();
                            checkPath(ret,iid);
                            debugPrint("Index:"+traceInfo.getPreviousIndex());
                        }
                    }
                }
            }

            this.RR_Fr = function (iid) {
                if (mode === MODE_RECORD || mode === MODE_REPLAY) {
                    frameStack.pop();
                    frame = frameStack[frameStack.length-1];
                    if (mode === MODE_RECORD) {
                        flush();
                    }
                }
            }

            this.RR_Se = function(iid,val) {
                var ret;
                if (mode === MODE_RECORD || mode === MODE_REPLAY) {
                    frameStack.push(frame={});
                    frame[SPECIAL_PROP3] = frameStack[0];
                    if (mode === MODE_RECORD) {
                        var tmp = printableValue(val);
                        logValue(iid,tmp,N_LOG_SCRIPT_ENTER);
                    } else if (mode === MODE_REPLAY) {
                        ret = traceInfo.getAndNext();
                        checkPath(ret,iid);
                        debugPrint("Index:"+traceInfo.getPreviousIndex());
                    }
                }
            }

            this.RR_Sr = function(iid) {
                if (mode === MODE_RECORD || mode === MODE_REPLAY) {
                    frameStack.pop();
                    frame = frameStack[frameStack.length-1];
                    if (mode === MODE_RECORD) {
                        flush();
                    }
                }
                if (isBrowserReplay) {
                    this.RR_replay();
                }
            }


            this.RR_H = function (iid,val) {
                var ret;
                if (mode === MODE_RECORD) {
                    ret = Object.create(null);
                    for (var i in val) {
                        if (i !== SPECIAL_PROP && i !== SPECIAL_PROP2 && i !== SPECIAL_PROP3){
                            ret[i] = 1;
                        }
                    }
                    var tmp = [];
                    tmp[F_TYPE] = getNumericType(ret);
                    tmp[F_VALUE] = ret;
                    logValue(iid, tmp, N_LOG_HASH);
                    val = ret;
                } else if (mode === MODE_REPLAY) {
                    ret = traceInfo.getAndNext();
                    checkPath(ret,iid);
                    debugPrint("Index:"+traceInfo.getPreviousIndex());
                    val = ret[F_VALUE];
                    ret = Object.create(null);
                    for (i in val) {
                        if (HOP(val,i)) {
                            ret[i] = 1;
                        }
                    }
                    val = ret;
                }
                return val;
            }


            this.RR_L = function (iid, val, fun) {
                var ret, tmp;
                if (mode === MODE_RECORD) {
                    tmp = printableValue(val);
                    logValue(iid,tmp,fun);
                } else if (mode === MODE_REPLAY) {
                    ret = traceInfo.getCurrent();
                    checkPath(ret,iid);
                    traceInfo.next();
                    debugPrint("Index:"+traceInfo.getPreviousIndex());
                    val = syncValue(ret,val,iid);
                }
                return val;
            }

            this.RR_T = function (iid,val,fun) {
                if ((mode === MODE_RECORD || mode === MODE_REPLAY) &&
                    (fun === N_LOG_ARRAY_LIT || fun === N_LOG_FUNCTION_LIT || fun === N_LOG_OBJECT_LIT || fun === N_LOG_REGEXP_LIT)){
                    setLiteralId(val);
                    if (fun === N_LOG_FUNCTION_LIT) {
                        val[SPECIAL_PROP3] = frame;
                    }
                }
            }

            function load(path) {
                var head, script;
                head = document.getElementsByTagName('head')[0];
                script= document.createElement('script');
                script.type= 'text/javascript';
                script.src= path;
                head.appendChild(script);
            }

            this.RR_replay = function() {
                if (mode=== MODE_REPLAY) {
                    while(true) {
                        var ret = traceInfo.getCurrent();
                        if (typeof ret !== 'object') {
                            if (isBrowserReplay) {
                                endExecution();
                            }
                            return;
                        }
                        var f, prefix;
                        if (ret[F_FUNNAME] === N_LOG_SPECIAL) {
                            prefix = ret[F_VALUE];
                            traceInfo.next();
                            ret = traceInfo.getCurrent();
                            if (sEngine && sEngine.beginExecution) {
                                sEngine.beginExecution(prefix);
                            }
                        }
                        if (ret[F_FUNNAME] === N_LOG_FUNCTION_ENTER) {
                            f = getConcrete(syncValue(ret, undefined,0));
                            ret = traceInfo.getNext();
                            var dis = syncValue(ret, undefined, 0);
                            f.call(dis);
                        } else if (ret[F_FUNNAME] === N_LOG_SCRIPT_ENTER) {
                            var path = getConcrete(syncValue(ret, undefined,0));
                            if (isBrowserReplay) {
                                load(path);
                                return;
                            } else {
                                var pth = require('path');
                                require(pth.resolve(path));
                            }
                        } else {
                            return;
                        }
                    }
                }
            }

            var parent = this;

            function TraceInfo () {
                var traceArray = [];
                var traceIndex = 0;
                var currentIndex = 0;
                var frontierIndex = 0;
                var MAX_SIZE = 1024;
                var traceFh;
                var done = false;
                var curRecord = null;



                parent.addRecord = function(line) {
                    var record = JSON.parse(line);
                    traceArray.push(record);
                    debugPrint(JSON.stringify(record));
                    frontierIndex++;
                }

                function cacheRecords() {
                    var i = 0, flag, record;

                    if (isBrowserReplay) {
                        return;
                    }
                    if (currentIndex >= frontierIndex) {
                        if (!traceFh) {
                            var FileLineReader = require('./utils/FileLineReader');
                            traceFh = new FileLineReader(process.argv[2]?process.argv[2]:TRACE_FILE_NAME);
                        }
                        traceArray = [];
                        while (!done && (flag = traceFh.hasNextLine()) && i < MAX_SIZE) {
                            record = JSON.parse(traceFh.nextLine());
                            traceArray.push(record);
                            debugPrint(i + ":" + JSON.stringify(record));
                            frontierIndex++;
                            i++;
                        }
                        if (!flag && !done) {
                            traceFh.close();
                            done = true;
                        }
                    }
                }

                this.getAndNext = function() {
                    if (curRecord !== null) {
                        var ret = curRecord;
                        curRecord = null;
                        return ret;
                    }
                    cacheRecords();
                    var j = isBrowserReplay?currentIndex:currentIndex%MAX_SIZE;
                    var record = traceArray[j];
                    if (record && record[F_SEQ] === traceIndex) {
                        currentIndex++;
                        optimizedLogs++;
                    } else {
                        record = undefined;
                    }
                    traceIndex++;
                    unoptimizedLogs++;
                    return record;
                }

                this.getNext = function() {
                    if (curRecord !== null) {
                        throw new Error("Cannot do two getNext() in succession");
                    }
                    var tmp = this.getAndNext();
                    var ret = this.getCurrent();
                    curRecord = tmp;
                    return ret;
                }

                this.getCurrent = function() {
                    if (curRecord !== null) {
                        return curRecord;
                    }
                    cacheRecords();
                    var j = isBrowserReplay?currentIndex:currentIndex%MAX_SIZE;
                    var record = traceArray[j];
                    if (!(record && record[F_SEQ] === traceIndex)) {
                        record = undefined;
                    }
                    return record;
                }

                this.next = function() {
                    if (curRecord !== null) {
                        curRecord = null;
                        return;
                    }
                    cacheRecords();
                    var j = isBrowserReplay?currentIndex:currentIndex%MAX_SIZE;
                    var record = traceArray[j];
                    if (record && record[F_SEQ] === traceIndex) {
                        currentIndex++;
                        optimizedLogs++;
                    }
                    traceIndex++;
                    unoptimizedLogs++;
                };

                this.getPreviousIndex = function() {
                    if (curRecord !== null) {
                        return traceIndex-2;
                    }
                    return traceIndex-1;
                }

            }

            function init() {
//            var record, traceFh;
//            var i = 0;

                if (mode === MODE_REPLAY) {
                    traceInfo = new TraceInfo();
                } else if (mode === MODE_RECORD && typeof window  !== 'undefined') {
                    command('reset');
                }
            }

            init();


        }

        //----------------------------------- End Record Replay Engine ---------------------------------


        function endExecution() {
            if (branchCoverageInfo)
                branchCoverageInfo.storeBranchInfo();
            var pSkippedReads = 100.0*skippedReads/(unoptimizedLogs-optimizedLogs);
            var pOptimizedLogs = 100.0*optimizedLogs/unoptimizedLogs;
            //console.log("Reads Skipped, GetFields Skipped, Total Logs (unoptimized), Total Logs (optimized), % of skips that are local reads, % of reduction in logging = "+
            //    skippedReads+" , "+skippedGetFields+" , "+unoptimizedLogs+" , "+optimizedLogs+ " , "+pSkippedReads+"% , "+pOptimizedLogs+"%");
            if (sEngine && sEngine.endExecution) {
                sEngine.endExecution();
            }
        }


        sandbox.U = U; // Unary operation
        sandbox.B = B; // Binary operation
        sandbox.C = C; // Condition
        sandbox.C1 = C1; // Switch key
        sandbox.C2 = C2; // case label C1 === C2
        sandbox.addAxiom = addAxiom; // Add axiom
        sandbox.getConcrete = getConcrete;  // Get concrete value
        sandbox._ = last;  // Last value passed to C

        sandbox.H = H; // hash in for-in
        sandbox.I = I; // Ignore argument
        sandbox.G = G; // getField
        sandbox.P = P; // putField
        sandbox.R = R; // Read
        sandbox.W = W; // Write
        sandbox.N = N; // Init
        sandbox.T = T; // object/function/regexp/array Literal
        sandbox.F = F; // Function call
        sandbox.M = M; // Method call
        sandbox.A = A; // Modify and assign +=, -= ...
        sandbox.Fe = Fe; // Function enter
        sandbox.Fr = Fr; // Function return
        sandbox.Se = Se; // Script enter
        sandbox.Sr = Sr; // Script return
        sandbox.Rt = Rt; // returned value
        sandbox.Ra = Ra;

        sandbox.replay = rrEngine?rrEngine.RR_replay:undefined;
        sandbox.onflush = rrEngine?rrEngine.onflush:function(){};
        sandbox.record = rrEngine?rrEngine.record:function(){};
        sandbox.command = rrEngine?rrEngine.command:function(){};
        sandbox.sEngine = sEngine;
        sandbox.endExecution = endExecution;
        sandbox.addRecord = rrEngine?rrEngine.addRecord:undefined;

        sandbox.log = log;



}
}(J$));


//@TODO: test with apply and call
//@TODO: associate iid with source line and column

//@todo:@assumption arguments.callee is available
//@todo:@assumptions SPECIAL_PROP = "*J$*" is added to every object, but its enumeration is avoided in instrumented code
//@todo:@assumptions get and set of objects in ES5 could be problem
//@todo:@assumptions ReferenceError when accessing an undeclared uninitialized variable won't be thrown
//@todo:@assumption window.x is not initialized in node.js replay mode when var x = e is done in the global scope, but handled using syncValues
//@todo:@assumption eval is not renamed
//@todo: with needs to be handled
//@todo: new Function and setTimeout
//@todo: @assumption implicit call of toString and valueOf on objects during type conversion
// could lead to inaccurate replay if the object fields are not synchronized
//@todo: @assumption JSON.stringify of any float could be inaccurate, so logging could be inaccurate
//@todo: implicit type conversion from objects/arrays/functions during binary and unary operations could break record/replay



// change line: 1 to line: 8 in node_modules/source-map/lib/source-map/source-node.js
