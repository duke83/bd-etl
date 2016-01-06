angular.module('app.glossary')
.directive('glossaryItem',function(){
        return{
            restrict:'E',
            templateUrl:'./js/features/glossary/glossaryItem/glossary-item.html',
            scope:{itm:"="},
            controller:glossaryItemController,
            link:function(scp,el,attr){
                if(!scp.itm.descriptives)
                {
                    scp.itm.descriptives=[{
                        "type": "histogram",
                        "labels": ["glossaryItem", "February", "March", "April", "May", "June", "July"],
                        "series": ["Series A", "Series B"],
                        "data": [[65, 59, 80, 81, 56, 55, 40], [28, 48, 40, 19, 86, 27, 90]]
                    },
                        {
                            "type": "5-Year Trend",
                            "labels": ["2015 Q1", "2015 Q2", "March", "April", "May", "June", "July"],
                            "series": ["Series A", "Series B"],
                            "data": [[65, 59, 80, 81, 56, 55, 40], [28, 48, 40, 19, 86, 27, 90]]
                        }]
                }
                scp.histogramData=scp.itm.descriptives[0];
            }

        }
        function glossaryItemController(){
            var vm=this;

            vm.mouseover=function(){

            }
        }
    })