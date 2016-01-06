angular.module('app.glossary')
    .factory('glossaryService', glossaryService);

glossaryService.$inject = ['$http', '$resource'];

function glossaryService($http, $resource) {

    return {
         getItems: getItems,
        getItemsByShortDescription:getItemsByShortDescription

    };

    function getItems(srchprm) {
        var resource = getGlossaryResource(srchprm, 'getItemsByVarName');
        return resource.query();
    }

    function getItemsByShortDescription(srchprm) {
        var resource = getGlossaryResource(srchprm, 'getItemsByShortDesc');
        return resource.query();
    }

    function getGlossaryResource(srchprm, methodName) {
        var glossaryResource = $resource('https://dkhfzfqxpg.execute-api.us-east-1.amazonaws.com/prod1/fdicglossary',
            {srchParam: srchprm, methodName: methodName}
        );
        return glossaryResource;
    }
}
