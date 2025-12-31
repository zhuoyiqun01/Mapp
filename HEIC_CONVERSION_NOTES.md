# HEIC/HEIF 转换说明

## 当前限制

由于 iPhone 15 Pro 等新设备使用了更新的 HEIF 格式，现有的浏览器端转换库（如 `heic2any`）可能无法完全支持。这是已知的技术限制。

## 推荐的解决方案

### 方案 1：在 iPhone 上更改相机设置（推荐）
1. 打开 iPhone **设置**
2. 进入 **相机**
3. 选择 **格式**
4. 选择 **兼容性最佳**（而不是"高效"）

这样新拍摄的照片将直接以 JPEG 格式保存，无需转换。

### 方案 2：使用 Mac 预览应用转换
1. 在 Mac 上打开 **预览** 应用
2. 打开 HEIC 图片
3. 选择 **文件 > 导出**
4. 格式选择 **JPEG** 或 **PNG**
5. 保存后上传到应用

### 方案 3：使用在线转换工具
- [CloudConvert](https://cloudconvert.com/heic-to-jpg) - 支持 HEIC 转 JPEG
- [Convertio](https://convertio.co/zh/heic-jpg/) - 在线格式转换
- [HEICtoJPEG](https://heictojpeg.com/) - 专门的 HEIC 转换工具

### 方案 4：使用第三方应用
在 App Store 搜索 "HEIC 转换" 或 "HEIF 转换"，有多款应用可以批量转换。

## 技术说明

当前使用的 `heic2any` 库基于 `libheif`，但：
- iPhone 15 Pro 使用了更新的 HEIF 编码特性
- 浏览器端 WebAssembly 版本的 `libheif` 可能不支持这些新特性
- 这是库本身的限制，不是应用代码的问题

## 未来改进

可以考虑：
1. 等待 `heic2any` 或 `libheif` 更新支持新格式
2. 实现服务器端转换（需要后端支持）
3. 使用更新的 WebAssembly 版本的 `libheif`












