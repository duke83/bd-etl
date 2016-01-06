//Each glossary item will have a series of descriptives
angular.module('app.glossary')
    .directive('glossaryDescriptives',GlossaryDescriptives);

function GlossaryDescriptives(){
    return{
        restrict:'E',
        require:'^glossaryItem',
        templateUrl:'./js/features/glossary/descriptives/glossary-descriptives.html',
    }
}