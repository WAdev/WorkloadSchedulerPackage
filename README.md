OpenWhisk Workload Scheduler Package
================

1. Download and install the Whisk and Docker CLI
2. Login with Whisk and Docker CLI (wadev)
3. run "cd dockerWorkloadSchedulerScheduleFeed; ./buildAndPush.sh wadev/openwhisk-workloadscheduler-feed"
4. run "wsk package create/update workloadscheduler --shared yes -p bluemixServiceName 'WorkloadScheduler'"
5. run "wsk action create/update --docker -a feed true workloadscheduler/schedule wadev/openwhisk-workloadscheduler-feed"
