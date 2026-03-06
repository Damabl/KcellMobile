 #import <React/RCTBridgeModule.h>
 #import <React/RCTEventEmitter.h>
 #import <CoreMotion/CoreMotion.h>
 #import <HealthKit/HealthKit.h>
 
 @interface StepCounterBridge : RCTEventEmitter <RCTBridgeModule>
 @end
 
 @implementation StepCounterBridge {
   CMPedometer *_pedometer;
   HKHealthStore *_healthStore;
   BOOL _isObservingSteps;
 }
 
 RCT_EXPORT_MODULE();
 
 + (BOOL)requiresMainQueueSetup
 {
   return NO;
 }
 
 - (instancetype)init
 {
   if (self = [super init]) {
     _pedometer = [CMPedometer new];
     _healthStore = [HKHealthStore new];
     _isObservingSteps = NO;
   }
   return self;
 }
 
 - (NSArray<NSString *> *)supportedEvents
 {
   return @[@"onStepCount"];
 }
 
 - (void)startObserving
 {
   _isObservingSteps = YES;
 }
 
 - (void)stopObserving
 {
   _isObservingSteps = NO;
   [self stopStepUpdates];
 }
 
 #pragma mark - HealthKit Authorization
 
 RCT_REMAP_METHOD(requestAuthorization,
                  requestAuthorizationWithResolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
 {
   if (![HKHealthStore isHealthDataAvailable]) {
     resolve(@(NO));
     return;
   }
 
   HKQuantityType *stepType = [HKObjectType quantityTypeForIdentifier:HKQuantityTypeIdentifierStepCount];
   if (!stepType) {
     resolve(@(NO));
     return;
   }
 
   NSSet *readTypes = [NSSet setWithObject:stepType];
 
   [_healthStore requestAuthorizationToShareTypes:nil
                                        readTypes:readTypes
                                       completion:^(BOOL success, NSError *error) {
     if (error) {
       reject(@"healthkit_auth_error", error.localizedDescription, error);
     } else {
       resolve(@(success));
     }
   }];
 }
 
 #pragma mark - Today steps via HealthKit
 
 RCT_REMAP_METHOD(getTodaySteps,
                  getTodayStepsWithResolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
 {
   if (![HKHealthStore isHealthDataAvailable]) {
     // HealthKit недоступен — JS поймет по -1
     resolve(@(-1));
     return;
   }
 
   HKQuantityType *stepType = [HKObjectType quantityTypeForIdentifier:HKQuantityTypeIdentifierStepCount];
   if (!stepType) {
     resolve(@(-1));
     return;
   }
 
   NSDate *now = [NSDate date];
   NSCalendar *calendar = [NSCalendar currentCalendar];
   NSDate *startOfDay = nil;
   [calendar rangeOfUnit:NSCalendarUnitDay startDate:&startOfDay interval:NULL forDate:now];
   if (!startOfDay) {
     resolve(@0);
     return;
   }
 
   NSPredicate *predicate = [HKQuery predicateForSamplesWithStartDate:startOfDay
                                                               endDate:now
                                                               options:HKQueryOptionStrictStartDate];
 
   HKStatisticsQuery *query =
   [[HKStatisticsQuery alloc] initWithQuantityType:stepType
                             quantitySamplePredicate:predicate
                                             options:HKStatisticsOptionCumulativeSum
                                   completionHandler:^(HKStatisticsQuery *q,
                                                       HKStatistics *statistics,
                                                       NSError *error) {
     if (error) {
       reject(@"healthkit_steps_error", error.localizedDescription, error);
       return;
     }
 
     HKQuantity *sum = statistics.sumQuantity;
     double value = [sum doubleValueForUnit:[HKUnit countUnit]];
     resolve(@((int)value));
   }];
 
   [_healthStore executeQuery:query];
 }
 
 #pragma mark - Live step updates (CMPedometer)
 
 RCT_EXPORT_METHOD(startStepUpdates)
 {
   if (![CMPedometer isStepCountingAvailable]) {
     [self sendEventWithName:@"onStepCount"
                        body:@{ @"error": @"Step counting not available on this device" }];
     return;
   }
 
   NSDate *now = [NSDate date];
   NSCalendar *calendar = [NSCalendar currentCalendar];
   NSDate *startOfDay = [calendar startOfDayForDate:now];
 
   __weak typeof(self) weakSelf = self;
   [_pedometer startPedometerUpdatesFromDate:startOfDay
                                  withHandler:^(CMPedometerData *data, NSError *error) {
     __strong typeof(self) strongSelf = weakSelf;
     if (!strongSelf) return;
 
     if (error) {
       [strongSelf sendEventWithName:@"onStepCount"
                                body:@{ @"error": error.localizedDescription ?: @"Unknown error" }];
       return;
     }
 
     if (!data) return;
 
     if (strongSelf->_isObservingSteps) {
       NSNumber *steps = data.numberOfSteps ?: @(0);
       [strongSelf sendEventWithName:@"onStepCount"
                                body:@{ @"steps": steps }];
     }
   }];
 }
 
 RCT_EXPORT_METHOD(stopStepUpdates)
 {
   [_pedometer stopPedometerUpdates];
 }
 
 @end
