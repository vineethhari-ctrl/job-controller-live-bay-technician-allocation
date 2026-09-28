import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'presentation/bloc/timeline_bloc/timeline_bloc.dart';
import 'presentation/bloc/chip_action_bloc/chip_action_bloc.dart';
import 'presentation/pages/tablet_timeline_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Force Landscape Orientation Lock for Kiosk Hardware (Samsung Tab Active)
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  
  // Enable Fullscreen Kiosk Mode (Immersive Sticky)
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  runApp(const JobControllerTabletApp());
}

class JobControllerTabletApp extends StatelessWidget {
  const JobControllerTabletApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<TimelineBloc>(
          create: (context) => TimelineBloc()..add(const FetchTimelineEvent(divisionId: 'div-1')),
        ),
        BlocProvider<ChipActionBloc>(
          create: (context) => ChipActionBloc(),
        ),
      ],
      child: MaterialApp(
        title: 'Live Bay Allocation (Tablet)',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xFF2F6BFF),
          brightness: Brightness.light,
          fontFamily: 'Roboto',
        ),
        darkTheme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xFF2F6BFF),
          brightness: Brightness.dark,
        ),
        home: const TabletTimelineScreen(),
      ),
    );
  }
}
