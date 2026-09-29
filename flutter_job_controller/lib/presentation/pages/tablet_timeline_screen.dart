import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../bloc/timeline_bloc/timeline_bloc.dart';
import '../bloc/timeline_bloc/timeline_state.dart';

class TabletTimelineScreen extends StatefulWidget {
  const TabletTimelineScreen({super.key});

  @override
  State<TabletTimelineScreen> createState() => _TabletTimelineScreenState();
}

class _TabletTimelineScreenState extends State<TabletTimelineScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0F172A))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() => _isLoading = true);
          },
          onPageFinished: (String url) {
            setState(() => _isLoading = false);
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView Error: ${error.description}');
          },
        ),
      )
      ..loadRequest(Uri.parse('http://192.168.31.51:3000/'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: Stack(
          children: [
            BlocBuilder<TimelineBloc, TimelineState>(
              builder: (context, state) {
                return WebViewWidget(controller: _controller);
              },
            ),
            if (_isLoading)
              const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(
                      color: Color(0xFF2F6BFF),
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Initializing Rugged Tablet Kiosk Mode…',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
