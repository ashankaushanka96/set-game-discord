import Foundation
import AppKit
import AVFoundation
import CoreGraphics
import CoreText
import VideoToolbox

let args=CommandLine.arguments
let output=URL(fileURLWithPath:args[3],isDirectory:true)
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
func load(_ path:String)->CGImage { let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:path) as CFURL,nil)!;return CGImageSourceCreateImageAtIndex(source,0,nil)! }
let cover=load(args[1]), background=load(args[2])
func color(_ hex:UInt32,_ alpha:CGFloat=1)->CGColor { CGColor(red:CGFloat((hex>>16)&255)/255,green:CGFloat((hex>>8)&255)/255,blue:CGFloat(hex&255)/255,alpha:alpha) }
func box(_ c:CGContext,_ r:CGRect,_ fill:UInt32,_ radius:CGFloat=0,_ stroke:UInt32?=nil) { c.setFillColor(color(fill));let p=CGPath(roundedRect:r,cornerWidth:radius,cornerHeight:radius,transform:nil);c.addPath(p);c.fillPath();if let s=stroke {c.setStrokeColor(color(s));c.setLineWidth(1);c.addPath(p);c.strokePath()} }
func image(_ c:CGContext,_ img:CGImage,_ r:CGRect) {c.saveGState();c.translateBy(x:r.minX,y:r.maxY);c.scaleBy(x:1,y:-1);c.interpolationQuality = .high;c.draw(img,in:CGRect(x:0,y:0,width:r.width,height:r.height));c.restoreGState()}
func text(_ c:CGContext,_ str:String,_ x:CGFloat,_ y:CGFloat,_ size:CGFloat,_ fill:UInt32=0xede3c9,_ font:String="AvenirNext-Medium",_ centered:Bool=false) { let f=CTFontCreateWithName(font as CFString,size,nil);let a=NSAttributedString(string:str,attributes:[.font:f,.foregroundColor:color(fill)]);let line=CTLineCreateWithAttributedString(a);let w=CTLineGetTypographicBounds(line,nil,nil,nil);c.saveGState();c.translateBy(x:centered ? x-w/2:x,y:y+size);c.scaleBy(x:1,y:-1);c.textPosition = .zero;CTLineDraw(line,c);c.restoreGState() }
func card(_ c:CGContext,_ x:CGFloat,_ y:CGFloat,_ rank:String,_ suit:String,_ rotation:CGFloat=0,width:CGFloat=31) {c.saveGState();c.translateBy(x:x,y:y);c.rotate(by:rotation);let r=CGRect(x:-width/2,y:-width*0.7,width:width,height:width*1.4);c.setShadow(offset:CGSize(width:1,height:3),blur:5,color:color(0x000000,0.4));box(c,r,0xf6efde,3,0xc7bda2);c.setShadow(offset:.zero,blur:0,color:nil);let red=suit=="♥" || suit=="♦";text(c,rank,r.minX+3,r.minY+2,width*0.25,red ? 0xb63e47:0x263b36,"Georgia-Bold");text(c,suit,0,-width*0.12,width*0.52,red ? 0xb63e47:0x263b36,"Georgia",true);c.restoreGState()}
func save(_ cg:CGImage,_ name:String) throws {let rep=NSBitmapImageRep(cgImage:cg);try rep.representation(using:.png,properties:[:])!.write(to:output.appendingPathComponent(name))}
func still(_ img:CGImage,_ name:String) throws {let c=CGContext(data:nil,width:1024,height:576,bitsPerComponent:8,bytesPerRow:4096,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!;c.translateBy(x:0,y:576);c.scaleBy(x:1,y:-1);image(c,img,CGRect(x:0,y:0,width:1024,height:576));try save(c.makeImage()!,name)}
try still(cover,"cover-art.png");try still(background,"background.png")
let movie=output.appendingPathComponent("video-preview.mp4")
if FileManager.default.fileExists(atPath:movie.path) {throw NSError(domain:"Output already exists; choose a new output directory",code:1)}
let writer=try AVAssetWriter(outputURL:movie,fileType:.mp4)
let settings:[String:Any]=[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:640,AVVideoHeightKey:360,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:260000,AVVideoMaxKeyFrameIntervalKey:48,AVVideoProfileLevelKey:AVVideoProfileLevelH264MainAutoLevel,AVVideoAllowFrameReorderingKey:false],AVVideoEncoderSpecificationKey:[kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder as String:false]]
let input=AVAssetWriterInput(mediaType:.video,outputSettings:settings)
let adapter=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:640,kCVPixelBufferHeightKey as String:360,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true])
writer.add(input);writer.shouldOptimizeForNetworkUse=true
 guard writer.startWriting() else {throw writer.error!}
writer.startSession(atSourceTime:.zero)
let seats:[(CGFloat,CGFloat,String,String)]=[(320,69,"MAYA","A"),(454,118,"LEO","B"),(454,220,"AVA","A"),(320,262,"YOU","B"),(186,220,"NOAH","A"),(186,118,"ZOE","B")]
func game(_ c:CGContext,_ t:Double) {
 box(c,CGRect(x:0,y:0,width:640,height:360),0x10241e)
 image(c,background,CGRect(x:0,y:0,width:640,height:360));c.setFillColor(color(0x0b211b,0.45));c.fill(CGRect(x:0,y:0,width:640,height:360))
 text(c,"SET GAME",28,18,13,0xe7ce94,"Georgia-Bold")
 text(c,t<4.4 ? "SIX PLAYERS. TWO TEAMS.":t<6.1 ? "PASS CARDS. COLLECT SETS.":"WIN THE ROUND. RULE THE TABLE.",320,319,15,0xf1e6ca,"AvenirNext-DemiBold",true)
 box(c,CGRect(x:205,y:87,width:230,height:168),0x4b3929,80,0xab8c4e);box(c,CGRect(x:212,y:94,width:216,height:154),0x1f5b46,75,0xc1a16b)
 c.setStrokeColor(color(0xb6c49b,0.2));c.setLineDash(phase:0,lengths:[3,3]);c.strokeEllipse(in:CGRect(x:222,y:104,width:196,height:134));c.setLineDash(phase:0,lengths:[])
 text(c,"♠",320,139,24,0x99b891,"Georgia",true);text(c,"YOUR TABLE",320,175,12,0xadc6aa,"Georgia",true)
 for (i,s) in seats.enumerated() {box(c,CGRect(x:s.0-30,y:s.1-24,width:60,height:48),0x203b2d,8,s.3=="A" ? 0x779eb2:0xc58d8b);text(c,["♠","♥","♣","♦","♠","♥"][i],s.0,s.1-20,18,s.3=="A" ? 0xd7e3da:0xe3aaa0,"Georgia",true);text(c,s.2,s.0,s.1+3,7,0xe7ddc1,"AvenirNext-Medium",true)}
 for i in 0..<5 {card(c,CGFloat(286+i*17),296,["2","4","7","K","A"][i],["♥","♥","♣","♦","♠"][i],CGFloat(i-2)*0.035,width:23)}
 let pass:Double=max(0,min(1,(t-2.65)/1.35))
 if pass>0 && pass<1 {
   let eased:Double=pass*pass*(3-2*pass)
   let px:CGFloat=CGFloat(320.0+134.0*eased)
   let py:CGFloat=CGFloat(262.0-144.0*eased-sin(pass*Double.pi)*35.0)
   card(c,px,py,"7","♥",CGFloat(pass)*0.2,width:27)
 }
 if t>=4.0 && t<5.8 {for i in 0..<3 {card(c,CGFloat(290+i*27),168,["2","4","7"][i],"♥",CGFloat(i-1)*0.07,width:30)};text(c,"A SET COMES TOGETHER",320,212,7,0xe8d297,"AvenirNext-DemiBold",true)}
 if t>=5.8 {let count=t>=6.5 ? 2:1;box(c,CGRect(x:267,y:125,width:106,height:62),0x152f24,8,0xa99460);text(c,"ROUND WINS",320,134,7,0xceba82,"AvenirNext-Medium",true);text(c,"A  \(count)  :  1  B",320,150,16,0xf3e4be,"Georgia-Bold",true)}
}
for frame in 0..<240 {
 while !input.isReadyForMoreMediaData {if writer.status == .failed {throw writer.error!};Thread.sleep(forTimeInterval:0.002)}
 var pb:CVPixelBuffer?;CVPixelBufferPoolCreatePixelBuffer(nil,adapter.pixelBufferPool!,&pb)
 let buffer=pb!;CVPixelBufferLockBaseAddress(buffer,[])
 let ctx=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:640,height:360,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
 let t=Double(frame)/24
 // Convert the bitmap context to top-left coordinates, matching the artwork.
 ctx.translateBy(x:0,y:360);ctx.scaleBy(x:1,y:-1)
 ctx.setFillColor(color(0x0b1a13));ctx.fill(CGRect(x:0,y:0,width:640,height:360))
 if t<2.3 || t>=7.7 {let drift=CGFloat(sin(t/10*Double.pi)*0.012);image(ctx,cover,CGRect(x:-640*drift/2,y:-360*drift/2,width:640*(1+drift),height:360*(1+drift)))} else {game(ctx,t)}
 // Gentle crossfades preserve a small compressed file and avoid abrupt cuts.
 if t>=2.3 && t<2.65 {ctx.setAlpha(CGFloat(1-(t-2.3)/0.35));image(ctx,cover,CGRect(x:0,y:0,width:640,height:360));ctx.setAlpha(1)}
 if t>=7.7 && t<8.05 {ctx.setAlpha(CGFloat(1-(t-7.7)/0.35));game(ctx,7.69);ctx.setAlpha(1)}
 if frame==110 {try save(ctx.makeImage()!,"preview-gameplay-frame.png")}
 CVPixelBufferUnlockBaseAddress(buffer,[])
 if !adapter.append(buffer,withPresentationTime:CMTime(value:Int64(frame),timescale:24)) {throw writer.error!}
}
input.markAsFinished();writer.endSession(atSourceTime:CMTime(seconds:10,preferredTimescale:24))
let sem=DispatchSemaphore(value:0);writer.finishWriting{sem.signal()};sem.wait()
if writer.status != .completed {throw writer.error!}
let size=(try FileManager.default.attributesOfItem(atPath:movie.path)[.size] as! NSNumber).intValue
print("Video: 640×360, 10 seconds, H.264, silent, \(size) bytes")
if size>500000 {throw NSError(domain:"Video exceeds 0.5 MB",code:size)}
let asset=AVURLAsset(url:movie);let gen=AVAssetImageGenerator(asset:asset);gen.appliesPreferredTrackTransform=true;gen.requestedTimeToleranceBefore = .zero;gen.requestedTimeToleranceAfter = .zero
let first=try gen.copyCGImage(at:CMTime(seconds:1,preferredTimescale:24),actualTime:nil);try save(first,"video-poster.png")
let middle=try gen.copyCGImage(at:CMTime(seconds:4.5,preferredTimescale:24),actualTime:nil);try save(middle,"video-gameplay-check.png")
print("Verified duration: \(CMTimeGetSeconds(asset.duration)) seconds; dimensions: \(asset.tracks(withMediaType:.video).first!.naturalSize)")
print("Assets exported to \(output.path)")
