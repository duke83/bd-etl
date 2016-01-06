angular.module('app.glossary')
    .directive('glossaryContainer', GlossaryContainer)


GlossaryContainerController.$inject = ['glossaryService'];

function GlossaryContainerController(glossaryService) {
    var vm = this;
    vm.name = 'xscope.name';
    //vm.name2=$scope.name

    //vm.items is a property set in link function (off of the 4th parameter - ctrl)
    console.log(vm.glossaryItems);
    //console.log('$scope',$scope)
    console.log('vm string', JSON.stringify(vm));
    console.log('vm', vm)
    vm.showSearchControlsContainer=false;
    vm.searchNameOrShort='varname';

    vm.updateGlossary=function(){
        if(vm.searchNameOrShort==="shortdescription"){
            vm.items = glossaryService.getItemsByShortDescription(vm.searchparam);
        }
        if(vm.searchNameOrShort==="varname") {
            vm.items = glossaryService.getItems(vm.searchparam);
        }
    }
}


function GlossaryContainer() {
    var directive = {
        restrict: 'E',
        templateUrl: './js/features/glossary/glossary-container.html',
        scope: {searchparam: "="},
        controller: GlossaryContainerController,
        controllerAs: 'vm',
        bindToController: true,
        link: function (scp, el, attr, ctrl) {
            //ctrl.name = 'liz';
            //scp.name='john';
            //console.log('ctrl string',JSON.stringify(ctrl));
            //console.log('ctrl',ctrl);
            //console.log('scp',scp);
        }
    }
    return directive;
}

