/// <reference path="../typings/node.d.ts" />
'use strict';
class TablePreparer {
    constructor(filename, emitter) {
        this._filename = filename;
        emitter.emit('testevent', 'hellox');
    }
    get filename() {
        return this._filename;
    }
}
exports.TablePreparer = TablePreparer;
//# sourceMappingURL=table-preparer.js.map