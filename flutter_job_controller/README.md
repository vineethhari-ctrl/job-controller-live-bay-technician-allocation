# Native Android Tablet Kiosk Module (Flutter BLoC)
## Tata Motors PV/EV Service Transformation — Live Bay Allocation

This directory contains the **Native Android Tablet Container** for workshop bay-floor tablets (e.g., Samsung Galaxy Tab Active 4 Pro rugged tablets).

### Architecture Highlights
- **Framework**: Flutter 3.x + Clean Architecture + BLoC (`flutter_bloc`)
- **Screen Orientation**: Hard Landscape Sensor Lock (`sensorLandscape`)
- **Hardware Integration**: Built-in support for rugged camera barcode scanners, RFID readers, and native hardware face login.
- **Enterprise Network Gateway**: Dio HTTP client configured for Kong API Gateway headers (`X-Dealer-Id`, `X-Division-Id`, `X-User-Role`).

---

### Project Structure
```
flutter_job_controller/
├── pubspec.yaml
├── android/                  # Native Android Kiosk Configuration
│   └── app/src/main/
│       └── AndroidManifest.xml # Kiosk permissions & landscape orientation lock
└── lib/
    ├── main.dart             # Kiosk initialization & Flutter BLoC setup
    ├── presentation/
    │   ├── bloc/             # TimelineBloc & ChipActionBloc
    │   └── pages/
    │       └── tablet_timeline_screen.dart # High-performance tablet canvas
```

---

### How to Build the Android APK (`.apk`)
When Flutter SDK is installed on the build machine:

```bash
cd flutter_job_controller
flutter pub get
flutter build apk --release
```

The compiled Android tablet APK will be generated at:
`flutter_job_controller/build/app/outputs/flutter-apk/app-release.apk`
