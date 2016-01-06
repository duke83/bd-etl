'use strict';
var FdicFileJobMakerModule = require("./job-maker");
console.log(FdicFileJobMakerModule);
var BankerDoodleEtl = (function () {
    //FdicFileJobMaker = FdicFileJobMaker;
    function BankerDoodleEtl(fdicFleJobsSqs) {
    }
    ;
    BankerDoodleEtl.prototype.makeFdicFileJobs = function () {
        var maker = new FdicFileJobMakerModule.FdicFileJobMaker();
        return maker.make();
    };
    return BankerDoodleEtl;
})();
exports.BankerDoodleEtl = BankerDoodleEtl;
//# sourceMappingURL=bd-etl.js.map