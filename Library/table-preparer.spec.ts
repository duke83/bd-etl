/// <reference path="../typings/jasmine.d.ts" />
/// <reference path="../typings/node.d.ts" />
'use strict';
import * as TablePreparerModule from "./table-preparer"
var EventEmitter = require('events');
var emitter = new EventEmitter();
//var tablePreparer =  TablePreparerModule
describe("table-preparer", function () {
        emitter.on('testevent', function (data) {
                console.log('TESTEVENT FIRED!!', data)
            }
        );
        var tp = new TablePreparerModule.TablePreparer('someting.csv', emitter);
console.log(tp)
    }
);

