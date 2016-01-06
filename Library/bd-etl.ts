'use strict';
import *  as FdicFileJobMakerModule from "./job-maker";
console.log(FdicFileJobMakerModule)
export class BankerDoodleEtl {
    //FdicFileJobMaker = FdicFileJobMaker;

    constructor(fdicFleJobsSqs:any) {
    };

    makeFdicFileJobs(){
        var maker = new FdicFileJobMakerModule.FdicFileJobMaker()
        return maker.make();
    }
}
