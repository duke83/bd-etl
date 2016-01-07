/// <reference path="../typings/jasmine.d.ts" />
/// <reference path="../typings/node.d.ts" />
var config = require("./config.js");
//var c = new config()
//console.log(config)
var BdEtlModule = require('./bd-etl.js');
//console.log(BdEtlModule);
describe('bd-etl', function () {
    var bdETL;
    beforeEach(function () {
        var bdEtlClass = BdEtlModule.BdETL;
        bdETL = new bdEtlClass(config);
        bdETL.processFiles();
    });
    it('should be defined', function () {
        expect(bdETL).toBeDefined();
    });
    it('should have a MakeFdicFileJobs method', function () {
        expect(bdETL.makeFdicFileJobs).toBeDefined();
        //console.log(bdETL.makeFdicFileJobs())
    });
});
//# sourceMappingURL=bd-etl.spec.js.map