declare module "socket.io-client" {
  interface SocketIoClientOptions {
    transports?: string[];
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    forceNew?: boolean;
    timeout?: number;
  }

  interface SocketIoClientSocket {
    on(event: string, listener: (...args: unknown[]) => void): void;
    disconnect(): void;
  }

  const io: (url: string, options?: SocketIoClientOptions) => SocketIoClientSocket;
  export default io;
}
