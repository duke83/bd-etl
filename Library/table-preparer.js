/// <reference path="../typings/node.d.ts" />
'use strict';
var QDate_1 = require("./QDate");
class TablePreparer {
    //    _emitter.on('table-exists', function (data) {
    //    console.log('table exists!', data)
    //})
    constructor(filename, emitter) {
        this._dynamoAlphaReadyToWrite = false;
        this._dynamoNumericReadyToWrite = false;
        this._secondsForTimeout = 60;
        this._filename = filename;
        this._qdate = QDate_1.QDate.getQDateFromFileName(filename);
        var datestring = this._qdate.string;
        this._dynamoTableNameAlpha = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-ALPHA';
        this._dynamoTableNameNumeric = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-NUM';
        this._emitter = emitter;
        this.buildAlphaTable(this._dynamoTableNameAlpha, function (err, data) {
            if (data) {
                console.log(data);
            }
        });
    }
    buildAlphaTable(tablename, cb) {
        let startTime = Date.now();
        let alphaTableExits = false;
        let alphaTableSchemaOk = false;
        let alphaTableReady = false;
        this._emitter.emit('testevent', this._qdate.string);
        //get schema for table
        //check schema properties to insure it is what we need
        //create new table if needed
        //poll for everything to be complete
        var interval1 = setInterval(function (emitter, tablename, secondsForTimeout) {
            var elapsedTime = Date.now() - startTime;
            console.log('interval', elapsedTime / 1000);
            if (elapsedTime / 1000 >= secondsForTimeout) {
                emitter.emit('testeventxxx', tablename);
                clearInterval(interval1);
                cb(null, true);
            }
        }, 5000, this._emitter, tablename, this._secondsForTimeout);
    }
    buildNumericTable(tablename) {
    }
    get filename() {
        return this._filename;
    }
}
exports.TablePreparer = TablePreparer;
var EventEmitter = require('events');
var emitter = new EventEmitter();
emitter.on('testeventxxx', function (data) {
    console.log('TESTEVENT FIRED!!', data);
});
var filename = 'All_Reports_20131231_Net+Loans+and+Leases.csv';
var tp = new TablePreparer(filename, emitter);
//# sourceMappingURL=table-preparer.js.map