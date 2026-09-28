import 'package:equatable/equatable.dart';

abstract class TimelineEvent extends Equatable {
  const TimelineEvent();

  @override
  List<Object?> get props => [];
}

class FetchTimelineEvent extends TimelineEvent {
  final String divisionId;
  final String? date;

  const FetchTimelineEvent({required this.divisionId, this.date});

  @override
  List<Object?> get props => [divisionId, date];
}

class RefreshTimelineEvent extends TimelineEvent {
  const RefreshTimelineEvent();
}
