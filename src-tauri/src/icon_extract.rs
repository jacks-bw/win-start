// 从 .exe / .lnk 提取图标，返回 PNG base64
// TODO: 后续用 windows-rs 完整实现 ExtractIconExW + GetIconInfo + GDI 位图转 PNG

pub fn extract_icon_png(_path: &str) -> Option<String> {
    None
}
