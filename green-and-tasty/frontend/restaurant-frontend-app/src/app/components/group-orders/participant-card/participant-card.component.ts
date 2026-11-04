import { CurrencyPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';

import { Participant } from '@app/models/group-orders/participant.model';

@Component({
  selector: 'app-participant-card',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './participant-card.component.html',
  styleUrl: './participant-card.component.scss',
})
export class ParticipantCardComponent {
  readonly participant = input.required<Participant>();
  readonly isMe = input(false);
  readonly canRemove = input(false);

  readonly removeClick = output<Participant>();

  onRemove(): void {
    this.removeClick.emit(this.participant());
  }
}
