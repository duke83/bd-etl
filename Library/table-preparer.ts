/// <reference path="../typings/node.d.ts" />
'use strict';

import * as QDateModule from './QDate';

export class TablePreparer{
    private _filename;

    constructor(filename:string, emitter){
        this._filename=filename;
        emitter.emit('testevent','hellox')
    }

    get filename(){
        return this._filename;
    }
}

