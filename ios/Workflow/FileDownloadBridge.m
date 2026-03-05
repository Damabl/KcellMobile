#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FileDownloadBridge, NSObject)

RCT_EXTERN_METHOD(saveFileBase64:(NSString *)fileName
                  base64Data:(NSString *)base64Data
                  mimeType:(NSString *)mimeType
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getDocumentsDirectory:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end




