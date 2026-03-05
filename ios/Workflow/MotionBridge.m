#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(MotionBridge, RCTEventEmitter)

RCT_EXTERN_METHOD(startMotionUpdates)
RCT_EXTERN_METHOD(stopMotionUpdates)

@end
