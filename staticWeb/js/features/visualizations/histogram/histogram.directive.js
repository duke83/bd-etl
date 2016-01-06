angular.module('app.visualizations')
    .directive('bnkrdHistogram', function () {
        return {
            restrict: 'E',
            templateUrl: './js/features/visualizations/histogram/histogram.html',
            scope: {
                labels: "=",
                series: "=",
                data: "=",
                varname: "="
            },
            link: function (scp, el, attrs, ctrl) {
                if (!scp.labels && !scp.series) {
                    scp.isSampleData=true;

                    //scp.labels = [["2014-Q1", "2014-Q2","2014-Q3"],[ "2014-Q4", "2015-Q1", "2015-Q2"]];
                    scp.labels = [  "2012-Q1", "2012-Q2","2012-Q3", "2012-Q4",
                                    "2013-Q1", "2013-Q2","2013-Q3", "2013-Q4",
                                    "2014-Q1", "2014-Q2","2014-Q3", "2014-Q4",
                                    "2015-Q1", "2015-Q2","2015-Q3", "2015-Q4"];
                    scp.series = [scp.varname?scp.varname:"assets"];
                    scp.data = [[65, 59, 80, 81, 56, 155, 180, 140, 128, 90, 40, 19, 5, 7, 3,2]];
                   // scp.data = [[65, 59, 80, 81, 56, 55, 40], [28, 48, 40, 19, 86, 27, 90]];
                }

                scp.varname = attrs.varname;

                scp.onClick = function (points, evt) {
                    console.log(points, evt);
                };
            }
        }
    })