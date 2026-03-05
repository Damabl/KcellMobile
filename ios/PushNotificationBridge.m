#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PushNotificationBridge, NSObject)

RCT_EXTERN_METHOD(saveAuthToken:(NSString *)authToken
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getFCMToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
