import 'package:equatable/equatable.dart';

abstract class TimelineState extends Equatable {
  const TimelineState();

  @override
  List<Object?> get props => [];
}

class TimelineInitial extends TimelineState {}

class TimelineLoading extends TimelineState {}

class TimelineLoaded extends TimelineState {
  final String date;
  final int totalBays;
  final int activeChipsCount;

  const TimelineLoaded({
    required this.date,
    required this.totalBays,
    required this.activeChipsCount,
  });

  @override
  List<Object?> get props => [date, totalBays, activeChipsCount];
}

class TimelineError extends TimelineState {
  final String message;

  const TimelineError(this.message);

  @override
  List<Object?> get props => [message];
}
