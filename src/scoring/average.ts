export class RunningAverage {
  private total = 0;
  private n = 0;

  add(value: number) {
    if (!Number.isFinite(value)) {
      return;
    }
    this.total += value;
    this.n += 1;
  }

  get count() {
    return this.n;
  }

  get average() {
    if (this.n === 0) {
      return 0;
    }
    return this.total / this.n;
  }
}
