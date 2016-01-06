/// <reference path="../typings/jasmine.d.ts" />
/// <reference path="../typings/node.d.ts" />
var BdEtlModule = require('./bd-etl.js');
console.log(BdEtlModule);
describe('bd-etl', function () {
    var bdEtl;
    beforeEach(function () {
        var bdEtlClass = BdEtlModule.BdEtl;
        console.log(bdEtlClass);
        bdEtl = new bdEtlClass();
        console.log(bdEtl);
    });
    it('should be defined', function () {
        expect(bdEtl).toBeDefined();
    });
    it('should have a MakeFdicFileJobs method', function () {
        expect(bdEtl.makeFdicFileJobs).toBeDefined();
        console.log(bdEtl.makeFdicFileJobs());
    });
});
//# sourceMappingURL=bd-etl.spec.js.map