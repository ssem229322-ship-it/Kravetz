import { 
  Task, 
  Run, 
  AgentExecution, 
  Artifact, 
  TaskStatus, 
  RunStatus, 
  ExecutionStatus, 
  OnStepError, 
  WorkflowStep, 
  WorkflowDefinition 
} from './types';

 
 
 
class Core {
  private tasks: Task[] = [];
  private runs: Run[] = [];
  private executions: AgentExecution[] = [];
  private artifacts: Artifact[] = [];

  public createTask(task: Task): void {
    this.tasks.push(task);
  }

  public createRun(run: Run): void {
    this.runs.push(run);
  }

  public createExecution(execution: AgentExecution): void {
    this.executions.push(execution);
  }

  public createArtifact(artifact: Artifact): void {
    this.artifacts.push(artifact);
  }

  public getTask(id: string): Task | undefined {
    return this.tasks.find((task) => task.id === id);
  }

  public getRun(id: string): Run | undefined {
    return this.runs.find((run) => run.id === id);
  }

  public getExecution(id: string): AgentExecution | undefined {
    return this.executions.find((execution) => execution.id === id);
  }

  public getArtifact(id: string): Artifact | undefined {
    return this.artifacts.find((artifact) => artifact.id === id);
  }
}

export default Core;
 
