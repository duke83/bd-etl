/// <reference path="../typings/jasmine.d.ts" />
/// <reference path="../typings/node.d.ts" />
'use strict';
var TablePreparerModule = require("./table-preparer");
var EventEmitter = require('events');
var emitter = new EventEmitter();
//var tablePreparer =  TablePreparerModule
describe("table-preparer", function () {
    emitter.on('testevent', function (data) {
        console.log('TESTEVENT FIRED!!', data);
    });
    var tp = new TablePreparerModule.TablePreparer('someting.csv', emitter);
    console.log(tp);
});
//# sourceMappingURL=table-preparer.spec.js.map