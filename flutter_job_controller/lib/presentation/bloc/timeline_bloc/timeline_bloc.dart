import 'package:flutter_bloc/flutter_bloc.dart';
import 'timeline_event.dart';
import 'timeline_state.dart';

class TimelineBloc extends Bloc<TimelineEvent, TimelineState> {
  TimelineBloc() : super(TimelineInitial()) {
    on<FetchTimelineEvent>(_onFetchTimeline);
    on<RefreshTimelineEvent>(_onRefreshTimeline);
  }

  Future<void> _onFetchTimeline(
    FetchTimelineEvent event,
    Emitter<TimelineState> emit,
  ) async {
    emit(TimelineLoading());
    try {
      // Simulating API call to Kong API Gateway
      await Future.delayed(const Duration(milliseconds: 500));
      emit(const TimelineLoaded(
        date: '2026-09-28',
        totalBays: 6,
        activeChipsCount: 12,
      ));
    } catch (e) {
      emit(TimelineError(e.toString()));
    }
  }

  Future<void> _onRefreshTimeline(
    RefreshTimelineEvent event,
    Emitter<TimelineState> emit,
  ) async {
    // Background polling re-fetch
  }
}
