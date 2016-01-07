/// <reference path="../typings/jasmine.d.ts" />
/// <reference path="../typings/node.d.ts" />
'use strict';
var TablePreparerModule = require("./table-preparer");
var EventEmitter = require('events');
var emitter = new EventEmitter();
//var tablePreparer =  TablePreparerModule
describe("table-preparer", function () {
    emitter.on('testevent', function (data) {
        //console.log('TESTEVENT FIRED!!', data)
    });
    var filename = 'All_Reports_20131231_Net+Loans+and+Leases.csv';
    var tp = new TablePreparerModule.TablePreparer(filename, emitter);
    //console.log(tp)
});
//# sourceMappingURL=table-preparer.spec.js.map