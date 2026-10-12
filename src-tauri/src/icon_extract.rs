// 从 .exe / .lnk 提取图标，返回 PNG base64

use base64::Engine;
use std::os::windows::ffi::OsStrExt;
use windows::core::PCWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS,
};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

fn to_wide(s: &str) -> Vec<u16> {
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub fn extract_icon_png(path: &str) -> Option<String> {
    let wide = to_wide(path);
    unsafe {
        let mut large = HICON::default();
        let count = ExtractIconExW(
            PCWSTR(wide.as_ptr()),
            0,
            Some(&mut large as *mut HICON),
            None,
            1,
        );
        if count == 0 || large.is_invalid() {
            return None;
        }
        let result = hicon_to_png_base64(large);
        let _ = DestroyIcon(large);
        result
    }
}

unsafe fn hicon_to_png_base64(hicon: HICON) -> Option<String> {
    let mut info = ICONINFO::default();
    if GetIconInfo(hicon, &mut info).is_err() {
        return None;
    }

    let hdc = GetDC(HWND::default());
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    // 先查询尺寸
    GetDIBits(
        hdc,
        info.hbmColor,
        0,
        0,
        None,
        &mut bmi,
        DIB_RGB_COLORS,
    );
    let width = bmi.bmiHeader.biWidth;
    let height = bmi.bmiHeader.biHeight.abs();
    if width <= 0 || height <= 0 {
        let _ = ReleaseDC(HWND::default(), hdc);
        return None;
    }

    let row_size = ((width * 4 + 3) / 4) * 4;
    let mut pixels = vec![0u8; (row_size * height) as usize];
    bmi.bmiHeader.biHeight = -height; // 自顶向下
    GetDIBits(
        hdc,
        info.hbmColor,
        0,
        height as u32,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    let _ = ReleaseDC(HWND::default(), hdc);

    // BGRA -> RGBA
    let mut rgba = vec![0u8; (width * height * 4) as usize];
    for i in 0..(width * height) as usize {
        rgba[i * 4] = pixels[i * 4 + 2]; // R
        rgba[i * 4 + 1] = pixels[i * 4 + 1]; // G
        rgba[i * 4 + 2] = pixels[i * 4]; // B
        rgba[i * 4 + 3] = pixels[i * 4 + 3]; // A
    }

    let _ = DeleteObject(info.hbmColor);
    let _ = DeleteObject(info.hbmMask);

    let mut buf = std::io::Cursor::new(Vec::new());
    let img = image::RgbaImage::from_raw(width as u32, height as u32, rgba)?;
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut buf, image::ImageFormat::Png)
        .ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}
