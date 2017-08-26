export default class Timeout {

    private startTime;
    private duration = 0;

    constructor(duration: number) {
        this.duration = duration;
        this.startTime = new Date();
    }

    public isTimedOut() {
        return this.getDuration() > this.duration;
    }

    public logDuration(message = '') {
        console.log(`${message}: ${this.getDuration()}`);
    }

    private getDuration(): number {
        return (new Date()).getTime() - this.startTime.getTime();
    }
}
