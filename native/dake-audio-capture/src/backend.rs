use crate::buffer::SampleRing;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::buffer::ToF32Sample;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use cpal::{Device, DeviceId, SampleFormat, SupportedStreamConfig};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::str::FromStr;
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
mod macos_sck;

pub struct CaptureBackend {
    pub source: &'static str,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub sample_rate: u32,
    pub channels: usize,
    pub last_error: Arc<Mutex<Option<String>>>,
    _session: BackendSession,
}

enum BackendSession {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    Cpal { _stream: cpal::Stream },
    #[cfg(target_os = "macos")]
    MacSystem { _session: macos_sck::MacSckSession },
}

pub struct CaptureDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub sample_rate: u32,
    pub channels: usize,
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
type CpalCapture = (u32, usize, Arc<Mutex<Option<String>>>, cpal::Stream);

#[cfg(target_os = "macos")]
pub fn start_system(ring: Arc<Mutex<SampleRing>>) -> Result<CaptureBackend, String> {
    let session = macos_sck::start(ring)?;
    Ok(CaptureBackend {
        source: "system",
        device_id: None,
        device_name: Some("System Audio".to_string()),
        sample_rate: session.sample_rate,
        channels: 2,
        last_error: session.last_error.clone(),
        _session: BackendSession::MacSystem { _session: session },
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn start_system(_ring: Arc<Mutex<SampleRing>>) -> Result<CaptureBackend, String> {
    Err("native system audio capture is not supported on this platform yet".to_string())
}

#[cfg(target_os = "windows")]
pub fn start_system(ring: Arc<Mutex<SampleRing>>) -> Result<CaptureBackend, String> {
    let host = cpal::default_host();
    let (device, config) = select_loopback_device(&host)?;
    let device_id = device.id().ok().map(|id| id.to_string());
    let device_name = Some(read_device_name(&device));
    let (sample_rate, channels, last_error, stream) = start_cpal_device(ring, device, config)?;
    Ok(CaptureBackend {
        source: "system",
        device_id,
        device_name,
        sample_rate,
        channels,
        last_error,
        _session: BackendSession::Cpal { _stream: stream },
    })
}


#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn start_input_device(
    ring: Arc<Mutex<SampleRing>>,
    requested_device_id: Option<&str>,
) -> Result<CaptureBackend, String> {
    let host = cpal::default_host();
    let device = resolve_input_device(&host, requested_device_id)?;
    // A default device can still be usable even when a backend cannot expose a stable ID.
    // Explicit device selection always resolves by ID before reaching this point.
    let device_id = device.id().ok().map(|id| id.to_string());
    let device_name = read_device_name(&device);
    let config = device
        .default_input_config()
        .map_err(|err| format!("failed to read input device format: {err}"))?;
    let (sample_rate, channels, last_error, stream) = start_cpal_device(ring, device, config)?;
    Ok(CaptureBackend {
        source: "input",
        device_id,
        device_name: Some(device_name),
        sample_rate,
        channels,
        last_error,
        _session: BackendSession::Cpal { _stream: stream },
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn start_input_device(
    _ring: Arc<Mutex<SampleRing>>,
    _requested_device_id: Option<&str>,
) -> Result<CaptureBackend, String> {
    Err("native microphone capture is not supported on this platform yet".to_string())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn list_input_devices() -> Result<Vec<CaptureDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_id = host
        .default_input_device()
        .and_then(|device| device.id().ok());
    let devices = host
        .input_devices()
        .map_err(|err| format!("failed to enumerate input devices: {err}"))?;
    let mut result = Vec::new();

    for device in devices {
        let Ok(id) = device.id() else {
            continue;
        };
        let Ok(config) = device.default_input_config() else {
            continue;
        };
        result.push(CaptureDeviceInfo {
            is_default: default_id.as_ref() == Some(&id),
            id: id.to_string(),
            name: read_device_name(&device),
            sample_rate: config.sample_rate(),
            channels: config.channels() as usize,
        });
    }

    result.sort_by(|left, right| {
        right
            .is_default
            .cmp(&left.is_default)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(result)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn list_input_devices() -> Result<Vec<CaptureDeviceInfo>, String> {
    Ok(Vec::new())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn resolve_input_device(
    host: &cpal::Host,
    requested_device_id: Option<&str>,
) -> Result<Device, String> {
    let requested = requested_device_id
        .map(str::trim)
        .filter(|id| !id.is_empty() && *id != "default");
    if let Some(requested) = requested {
        let id = DeviceId::from_str(requested)
            .map_err(|err| format!("invalid input device id: {err}"))?;
        return host
            .device_by_id(&id)
            .filter(DeviceTrait::supports_input)
            .ok_or_else(|| format!("input device is no longer available: {requested}"));
    }

    host.default_input_device()
        .ok_or_else(|| "no default input device was found".to_string())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn read_device_name(device: &Device) -> String {
    device
        .description()
        .map(|description| description.name().to_string())
        .unwrap_or_else(|_| "Unknown Audio Device".to_string())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn start_cpal_device(
    ring: Arc<Mutex<SampleRing>>,
    device: Device,
    config: SupportedStreamConfig,
) -> Result<CpalCapture, String> {
    let sample_rate = config.sample_rate();
    let channels = config.channels();
    let sample_format = config.sample_format();
    let stream_config = config.into();
    let last_error = Arc::new(Mutex::new(None));
    let error_slot = last_error.clone();
    let err_fn = move |err: cpal::Error| {
        // CPAL reports a transient underrun/overrun as an Xrun notification while
        // keeping the stream usable. Treating it as fatal poisons an otherwise
        // successful capture when stop_capture checks the backend health later.
        if matches!(err.kind(), cpal::ErrorKind::Xrun) {
            return;
        }
        if let Ok(mut guard) = error_slot.try_lock() {
            *guard = Some(err.to_string());
        }
    };

    ring.lock()
        .map_err(|err| format!("failed to configure capture buffer: {err}"))?
        .configure(sample_rate, channels as usize)?;

    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::F64 => build_stream::<f64>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::I8 => build_stream::<i8>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::I16 => build_stream::<i16>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::I32 => build_stream::<i32>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::I64 => build_stream::<i64>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::U8 => build_stream::<u8>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::U16 => build_stream::<u16>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::U32 => build_stream::<u32>(&device, stream_config, channels, ring, err_fn),
        SampleFormat::U64 => build_stream::<u64>(&device, stream_config, channels, ring, err_fn),
        _ => Err(cpal::Error::new(cpal::ErrorKind::UnsupportedConfig)),
    }
    .map_err(|err| format!("failed to build audio capture stream: {err}"))?;

    stream
        .play()
        .map_err(|err| format!("failed to start audio capture stream: {err}"))?;

    Ok((sample_rate, channels as usize, last_error, stream))
}

#[cfg(target_os = "windows")]
fn select_loopback_device(host: &cpal::Host) -> Result<(Device, SupportedStreamConfig), String> {
    let device = host
        .default_output_device()
        .ok_or_else(|| "no default output device for WASAPI loopback".to_string())?;
    let config = device
        .default_output_config()
        .map_err(|err| format!("failed to read output mix format: {err}"))?;
    Ok((device, config))
}










#[cfg(any(target_os = "windows", target_os = "macos"))]
fn build_stream<T>(
    device: &Device,
    config: cpal::StreamConfig,
    channels: u16,
    ring: Arc<Mutex<SampleRing>>,
    err_fn: impl FnMut(cpal::Error) + Send + 'static,
) -> Result<cpal::Stream, cpal::Error>
where
    T: cpal::SizedSample + ToF32Sample,
{
    let channel_count = channels as usize;
    device.build_input_stream(
        config,
        move |data: &[T], _| {
            if let Ok(mut guard) = ring.try_lock() {
                guard.push_interleaved(data, channel_count);
            }
        },
        err_fn,
        None,
    )
}
