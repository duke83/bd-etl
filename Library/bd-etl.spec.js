/// <reference path="../typings/jasmine.d.ts" />
var BankerDoodleEtl = require('./BankerDoodleEtl.js').BankerDoodleEtl;
console.log(BankerDoodleEtl);
describe('bankderdoodleETL', function () {
    var bankerDoodleEtl;
    beforeEach(function () {
        bankerDoodleEtl = new BankerDoodleEtl();
        console.log(bankerDoodleEtl);
        var cow = bankerDoodleEtl;
        console.log(cow.makeFdicFileJobs());
    });
    it('should be defined', function () {
        expect(bankerDoodleEtl).toBeDefined();
    });
    it('should have a MakeFdicFileJobs method', function () {
        expect(bankerDoodleEtl.makeFdicFileJobs).toBeDefined();
    });
});
//# sourceMappingURL=bd-etl.spec.js.map